-- Cobertura que vale hoje pra cada vaca — a mesma regra de coberturaAtualPorVaca
-- (src/lib/indicadores.ts), usada pelo Início e pelo resumo da fazenda.
--
-- Achado nos testes de 11/10/2026: "pra secar", "partos previstos" e "aguardando diagnóstico" do
-- bot, dos lembretes e dos alertas do gestor pegavam QUALQUER cobertura positiva/pendente que não
-- tivesse virado parto. Cobertura positiva de antes do parto atual, sem ligação com ele (dado
-- antigo, parto lançado antes de existir o vínculo), aparecia como gestação em curso — "secagem
-- atrasada" de vaca vazia, parto previsto no passado. E vaca com duas pendentes aparecia duas vezes.
--
-- Regra: a mais recente da lactação atual (data >= parto ativo; sem parto, todas), ignorando a que
-- já virou parto. É nela que o diagnóstico vale (regra 3) e é a mesma base do status reprodutivo
-- (_recalcular_status_reprodutivo, 0024).

create or replace view coberturas_atuais with (security_invoker = true) as
select distinct on (c.vaca_id)
  c.id, c.vaca_id, c.data_cobertura, c.diagnostico_prenhez
from coberturas c
where not exists (select 1 from partos p where p.cobertura_id = c.id)
  and not exists (
    select 1 from partos p
    where p.vaca_id = c.vaca_id and p.ativa and p.data_parto > c.data_cobertura
  )
order by c.vaca_id, c.data_cobertura desc, c.created_at desc;

-- ============================================================
-- Bot: ficha reprodutiva da vaca (0027)
-- ============================================================

create or replace function _rel_vaca_reproducao(p_vaca_id uuid, p_audio boolean) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vaca vacas;
  v_parto_id uuid;
  v_ind jsonb;
  v_ultima coberturas;
  v_parto_prev date;
  v_l text[] := '{}';
begin
  select * into v_vaca from vacas where id = p_vaca_id;
  select id into v_parto_id from partos where vaca_id = p_vaca_id and ativa order by data_parto desc limit 1;
  v_ind := _indicadores_lactacao(v_parto_id);

  -- só a cobertura da lactação atual (a que gerou o parto não conta mais)
  select c.* into v_ultima
  from coberturas c join coberturas_atuais a on a.id = c.id
  where c.vaca_id = p_vaca_id;
  if v_ultima.diagnostico_prenhez = 'positivo' then
    v_parto_prev := v_ultima.data_cobertura + 283;
  end if;

  if p_audio then
    v_l := v_l || format('Vaca %s, %s.', v_vaca.numero_identificacao, _rotulo_status(v_vaca.status_reprodutivo));
    if v_ind is not null then
      v_l := v_l || format('Pariu em %s, está com %s dias de lactação e %s dias em aberto.',
        _fmt_data((v_ind->>'data_parto')::date), v_ind->>'del', v_ind->>'dias_em_aberto');
    end if;
    if v_ultima.id is not null then
      v_l := v_l || format('Última cobertura em %s, diagnóstico %s.', _fmt_data(v_ultima.data_cobertura), v_ultima.diagnostico_prenhez);
      if v_parto_prev is not null then
        v_l := v_l || format('Parto previsto para %s.', _fmt_data(v_parto_prev));
      end if;
    else
      v_l := v_l || 'Nenhuma cobertura nesta lactação.'::text;
    end if;
    return array_to_string(v_l, ' ');
  end if;

  v_l := v_l || format('*Vaca %s* — reprodução', v_vaca.numero_identificacao);
  v_l := v_l || format('Situação: %s, %s', _rotulo_status(v_vaca.status_produtivo), _rotulo_status(v_vaca.status_reprodutivo));
  if v_ind is not null then
    v_l := v_l || ''::text;
    v_l := v_l || format('Parto: %s (%s dias de lactação)', _fmt_data((v_ind->>'data_parto')::date), v_ind->>'del');
    if v_ind->>'iep' is not null then
      v_l := v_l || format('IEP: %s dias', v_ind->>'iep');
    end if;
    v_l := v_l || format('Dias em aberto: %s%s', v_ind->>'dias_em_aberto',
      case when (v_ind->>'aberto_fechado')::boolean then '' else ' (ainda contando)' end);
    if v_ind->>'media' is not null then
      v_l := v_l || format('Média: %s L/dia (%s dias pesados)', _fmt_num((v_ind->>'media')::numeric), v_ind->>'dias_pesados');
      v_l := v_l || format('Projeção 305 dias: %s L', _fmt_num(round((v_ind->>'projecao_305')::numeric)));
    end if;
    if v_ind->>'persistencia' is not null then
      v_l := v_l || format('Persistência: %s%%', _fmt_num(round((v_ind->>'persistencia')::numeric)));
    end if;
  else
    v_l := v_l || ''::text;
    v_l := v_l || 'Sem lactação em andamento.'::text;
  end if;

  v_l := v_l || ''::text;
  if v_ultima.id is not null then
    v_l := v_l || format('Última cobertura: %s%s (diagnóstico: %s)', _fmt_data(v_ultima.data_cobertura),
      coalesce(' — ' || v_ultima.touro_semen, ''), v_ultima.diagnostico_prenhez);
    if v_parto_prev is not null then
      v_l := v_l || format('Parto previsto: %s', _fmt_data(v_parto_prev));
      v_l := v_l || format('Secar a partir de: %s', _fmt_data(v_parto_prev - 60));
    end if;
  else
    v_l := v_l || 'Nenhuma cobertura nesta lactação.'::text;
  end if;

  return array_to_string(v_l, chr(10));
end;
$$;

-- ============================================================
-- Bot: reprodução do rebanho (0027)
-- ============================================================

create or replace function _rel_reproducao_fazenda(p_propriedade_id uuid, p_audio boolean) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := _hoje_fazenda();
  v_partos text; v_n_partos integer;
  v_secar text; v_n_secar integer;
  v_pend text; v_n_pend integer;
  v_ind text; v_n_ind integer;
begin
  -- prenhezes confirmadas da lactação atual que ainda não viraram parto
  with prenhes as (
    select v.numero_identificacao as numero, v.status_produtivo, c.data_cobertura + 283 as parto
    from coberturas_atuais c join vacas v on v.id = c.vaca_id
    where v.propriedade_id = p_propriedade_id and c.diagnostico_prenhez = 'positivo'
  )
  select string_agg(format('- Vaca %s: parto em %s', numero, _fmt_data(parto)), chr(10) order by parto), count(*),
         (select string_agg(format('- Vaca %s: secar até %s', numero, _fmt_data(parto - 60)), chr(10) order by parto)
            from prenhes where status_produtivo = 'lactacao' and parto - 60 between v_hoje - 5 and v_hoje + 30),
         (select count(*) from prenhes where status_produtivo = 'lactacao' and parto - 60 between v_hoje - 5 and v_hoje + 30)
  into v_partos, v_n_partos, v_secar, v_n_secar
  from prenhes;

  select string_agg(format('- Vaca %s: coberta em %s (%s dias)', v.numero_identificacao, _fmt_data(c.data_cobertura), v_hoje - c.data_cobertura),
           chr(10) order by c.data_cobertura), count(*)
  into v_pend, v_n_pend
  from coberturas_atuais c join vacas v on v.id = c.vaca_id
  where v.propriedade_id = p_propriedade_id and c.diagnostico_prenhez = 'pendente';

  if p_audio then
    return format('Você tem %s vaca(s) prevista(s) pra parir, %s pra secar nos próximos 30 dias e %s cobertura(s) aguardando diagnóstico. Se quiser os detalhes de alguma, é só pedir.',
      v_n_partos, v_n_secar, v_n_pend);
  end if;

  with ativos as (
    select v.numero_identificacao as numero, _indicadores_lactacao(p.id) as i
    from partos p join vacas v on v.id = p.vaca_id
    where v.propriedade_id = p_propriedade_id and p.ativa
  )
  select string_agg(
           format('- Vaca %s: %s DEL, %s dias em aberto%s%s%s', numero, i->>'del', i->>'dias_em_aberto',
             coalesce(', IEP ' || (i->>'iep') || 'd', ''),
             coalesce(', ' || _fmt_num((i->>'media')::numeric) || ' L/dia', ''),
             coalesce(', persist. ' || _fmt_num(round((i->>'persistencia')::numeric)) || '%', '')),
           chr(10) order by numero),
         count(*)
  into v_ind, v_n_ind
  from ativos;

  return '*Reprodução do rebanho*' || chr(10) || chr(10)
    || format('Previsão de parto (%s):', v_n_partos) || chr(10) || coalesce(v_partos, 'Nenhuma.') || chr(10) || chr(10)
    || format('Para secar nos próximos 30 dias (%s):', v_n_secar) || chr(10) || coalesce(v_secar, 'Nenhuma.') || chr(10) || chr(10)
    || format('Aguardando diagnóstico (%s):', v_n_pend) || chr(10) || coalesce(v_pend, 'Nenhuma.') || chr(10) || chr(10)
    || format('Lactações em andamento (%s):', v_n_ind) || chr(10) || coalesce(v_ind, 'Nenhuma.');
end;
$$;

-- ============================================================
-- Gestor: alertas reprodutivos (0028)
-- ============================================================

create or replace function alertas_reprodutivos()
returns table (propriedade_id uuid, tipo text, vaca_id uuid, numero integer, data_ref date, dias integer)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (select _hoje_fazenda() as d),
  prenhes as (
    select v.propriedade_id, v.id as vaca_id, v.numero_identificacao, v.status_produtivo, c.data_cobertura
    from coberturas_atuais c join vacas v on v.id = c.vaca_id
    where c.diagnostico_prenhez = 'positivo'
  )
  select v.propriedade_id, 'diagnostico_atrasado', v.id, v.numero_identificacao, c.data_cobertura,
         (select d from hoje) - c.data_cobertura
  from coberturas_atuais c join vacas v on v.id = c.vaca_id
  where c.diagnostico_prenhez = 'pendente' and (select d from hoje) - c.data_cobertura > 45

  union all
  select propriedade_id, 'secagem_atrasada', vaca_id, numero_identificacao, data_cobertura + 223,
         (select d from hoje) - (data_cobertura + 223)
  from prenhes
  where status_produtivo = 'lactacao' and data_cobertura + 223 < (select d from hoje)

  union all
  select propriedade_id, 'parto_atrasado', vaca_id, numero_identificacao, data_cobertura + 283,
         (select d from hoje) - (data_cobertura + 283)
  from prenhes
  where (select d from hoje) - (data_cobertura + 283) > 15

  union all
  select v.propriedade_id, 'vazia_muito_tempo', v.id, v.numero_identificacao, p.data_parto,
         (select d from hoje) - p.data_parto
  from partos p join vacas v on v.id = p.vaca_id
  where p.ativa and v.status_produtivo = 'lactacao'
    and (select d from hoje) - p.data_parto > 120
    and not exists (
      select 1 from coberturas c
      where c.vaca_id = p.vaca_id and c.data_cobertura >= p.data_parto and c.diagnostico_prenhez = 'positivo'
    )

  union all
  select e.propriedade_id, 'doses_nao_confirmadas', null, null, e.data_entrega,
         (select d from hoje) - e.data_entrega
  from entregas_doses e
  where e.recebido_em is null and (select d from hoje) - e.data_entrega > 7;
$$;

revoke execute on function alertas_reprodutivos() from public, anon, authenticated;

-- ============================================================
-- Lembretes diários (0031)
-- ============================================================

create or replace function lembretes_do_dia()
returns table (propriedade_id uuid, telefone text, mensagem text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := _hoje_fazenda();
  v_prop record;
  v_secar text;
  v_diag text;
  v_partos text;
  v_ultimo_leite date;
  v_linhas text[];
begin
  for v_prop in
    select p.id, p.nome_propriedade,
           (select u.telefone from usuarios_whatsapp u
             where u.propriedade_id = p.id and u.ativo order by u.created_at limit 1) as telefone
    from propriedades p
    where p.lembretes_whatsapp and p.lembretes_ultimo_envio is distinct from v_hoje
  loop
    continue when v_prop.telefone is null;

    with prenhes as (
      select v.numero_identificacao as numero, v.status_produtivo, c.data_cobertura + 283 as parto
      from coberturas_atuais c join vacas v on v.id = c.vaca_id
      where v.propriedade_id = v_prop.id and c.diagnostico_prenhez = 'positivo'
    )
    select
      _lista_curta(array_agg(
        format('vaca %s (%s)', numero,
          case when parto - 60 < v_hoje then 'atrasada desde ' || to_char(parto - 60, 'DD/MM')
               else 'até ' || to_char(parto - 60, 'DD/MM') end)
        order by parto) filter (where status_produtivo = 'lactacao' and parto - 60 <= v_hoje + 7)),
      _lista_curta(array_agg(
        format('vaca %s (%s)', numero,
          case when parto < v_hoje then 'era ' || to_char(parto, 'DD/MM') || ' — registre o parto'
               else to_char(parto, 'DD/MM') end)
        order by parto) filter (where parto between v_hoje - 15 and v_hoje + 7))
    into v_secar, v_partos
    from prenhes;

    select _lista_curta(array_agg(format('vaca %s (coberta há %s dias)', v.numero_identificacao, v_hoje - c.data_cobertura)
             order by c.data_cobertura))
    into v_diag
    from coberturas_atuais c join vacas v on v.id = c.vaca_id
    where v.propriedade_id = v_prop.id and c.diagnostico_prenhez = 'pendente' and v_hoje - c.data_cobertura >= 30;

    -- só cobra leite de quem lança leite (já tem algum lançamento) e tem vaca em lactação
    select max(data) into v_ultimo_leite from leite_diario_propriedade where leite_diario_propriedade.propriedade_id = v_prop.id;

    v_linhas := '{}';
    if v_secar is not null then v_linhas := v_linhas || ('• Secar: ' || v_secar); end if;
    if v_diag is not null then v_linhas := v_linhas || ('• Diagnóstico de prenhez: ' || v_diag); end if;
    if v_partos is not null then v_linhas := v_linhas || ('• Parto previsto: ' || v_partos); end if;
    if v_ultimo_leite is not null and v_hoje - v_ultimo_leite >= 3
       and exists (select 1 from vacas where vacas.propriedade_id = v_prop.id and status_produtivo = 'lactacao') then
      v_linhas := v_linhas || format('• Leite: sem lançamento há %s dias', v_hoje - v_ultimo_leite);
    end if;

    continue when coalesce(array_length(v_linhas, 1), 0) = 0;

    propriedade_id := v_prop.id;
    telefone := v_prop.telefone;
    mensagem := format('Bom dia! Pendências da %s hoje:', v_prop.nome_propriedade) || chr(10)
      || array_to_string(v_linhas, chr(10)) || chr(10) || chr(10)
      || 'Pode responder aqui mesmo pra registrar. Pra parar os lembretes, desligue no site (toque no nome da fazenda).';
    return next;
  end loop;
end;
$$;

revoke execute on function lembretes_do_dia() from public, anon, authenticated;
grant execute on function lembretes_do_dia() to service_role;
