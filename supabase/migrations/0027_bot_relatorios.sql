-- Relatórios do WhatsApp calculados no banco (fase 1 do plano de 2026-10-11).
--
-- Antes, cada relatório baixava tabelas inteiras (coberturas, partos e leite de TODAS as fazendas)
-- pro n8n e calculava em JavaScript, com uma conta de média diferente da ficha da vaca no site. Agora
-- o nó "Consultar (RPC)" chama bot_consultar, que decide o relatório pela intenção/entidades e monta
-- o texto aqui — só com os dados da fazenda do telefone.
--
-- _indicadores_lactacao é a mesma regra de src/lib/indicadores.ts (ficha da vaca): média dos DIAS
-- PESADOS, projeção 305 = média × 305, persistência = últimos 30 dias ÷ 30 anteriores (60+ dias de
-- lactação), dias em aberto até a cobertura positiva mais recente da lactação (ou até hoje).
--
-- Também corrige o roteamento antigo: tipo_relatorio='geral' caía no relatório de leite (bug 8 do
-- CLAUDE.md); agora "geral" de uma vaca junta leite + reprodução, e "geral" da fazenda junta
-- produção + pendências reprodutivas.

create or replace function _indicadores_lactacao(p_parto_id uuid, p_hoje date default null) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := coalesce(p_hoje, _hoje_fazenda());
  v_parto partos;
  v_n integer;
  v_total numeric;
  v_media numeric;
  v_recente numeric;
  v_anterior numeric;
  v_persistencia numeric;
  v_positiva date;
  v_ultima_data date;
  v_ultima numeric;
begin
  select * into v_parto from partos where id = p_parto_id;
  if v_parto.id is null then
    return null;
  end if;

  with dias as (
    select data_controle as d, sum(litros) as l
    from controle_leite
    where parto_id = p_parto_id and data_controle between v_parto.data_parto and v_hoje
    group by data_controle
  )
  select count(*), sum(l), avg(l),
         avg(l) filter (where d > v_hoje - 30),
         avg(l) filter (where d > v_hoje - 60 and d <= v_hoje - 30)
  into v_n, v_total, v_media, v_recente, v_anterior
  from dias;

  select data_controle, sum(litros) into v_ultima_data, v_ultima
  from controle_leite
  where parto_id = p_parto_id and data_controle <= v_hoje
  group by data_controle
  order by data_controle desc
  limit 1;

  if v_hoje - v_parto.data_parto >= 60 and v_recente is not null and v_anterior > 0 then
    v_persistencia := v_recente / v_anterior * 100;
  end if;

  select max(data_cobertura) into v_positiva
  from coberturas
  where vaca_id = v_parto.vaca_id and data_cobertura >= v_parto.data_parto and diagnostico_prenhez = 'positivo';

  return jsonb_build_object(
    'data_parto', v_parto.data_parto,
    'iep', v_parto.iep,
    'del', v_hoje - v_parto.data_parto,
    'dias_pesados', v_n,
    'litros', coalesce(v_total, 0),
    'media', v_media,
    'projecao_305', v_media * 305,
    'persistencia', v_persistencia,
    'dias_em_aberto', coalesce(v_positiva, v_hoje) - v_parto.data_parto,
    'aberto_fechado', v_positiva is not null,
    'ultima_data', v_ultima_data,
    'ultima_litros', v_ultima
  );
end;
$$;

-- security definer sem checagem de fazenda: só pra uso interno (relatórios do bot)
revoke execute on function _indicadores_lactacao(uuid, date) from public, anon, authenticated;

-- Período pedido na mensagem (mesmas regras dos nós "Calcular Período" do bot):
--   "hoje" → só hoje; financeiro com "mês" (sem "passado/anterior") → mês-calendário atual;
--   periodo_dias → últimos N dias; senão → mês atual + mês passado.
create or replace function _periodo_consulta(
  p_mensagem text,
  p_periodo_dias integer,
  p_financeiro boolean,
  out inicio date,
  out rotulo text
)
language plpgsql
stable
as $$
declare
  v_hoje date := _hoje_fazenda();
  v_msg text := lower(coalesce(p_mensagem, ''));
begin
  if v_msg ~ '\mhoje\M' then
    inicio := v_hoje; rotulo := 'hoje';
  elsif p_financeiro and v_msg ~ '\mm(e|ê)s\M' and v_msg !~ '\m(passado|anterior)\M' then
    inicio := date_trunc('month', v_hoje)::date; rotulo := 'mês atual';
  elsif coalesce(p_periodo_dias, 0) > 0 then
    inicio := v_hoje - p_periodo_dias; rotulo := format('últimos %s dias', p_periodo_dias);
  else
    inicio := (date_trunc('month', v_hoje) - interval '1 month')::date; rotulo := 'mês atual e mês passado';
  end if;
end;
$$;

-- ============================================================
-- Relatórios de uma vaca
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

  select * into v_ultima from coberturas
  where vaca_id = p_vaca_id
  order by data_cobertura desc, created_at desc limit 1;
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
      v_l := v_l || 'Nenhuma cobertura registrada.'::text;
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
    v_l := v_l || 'Nenhuma cobertura registrada.'::text;
  end if;

  return array_to_string(v_l, chr(10));
end;
$$;

create or replace function _rel_vaca_leite(p_vaca_id uuid, p_audio boolean) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_parto_id uuid;
  v_ind jsonb;
  v_linhas text;
  v_total numeric;
  v_ultimo date;
  v_dias integer;
begin
  select numero_identificacao into v_numero from vacas where id = p_vaca_id;
  select id into v_parto_id from partos where vaca_id = p_vaca_id and ativa order by data_parto desc limit 1;
  v_ind := _indicadores_lactacao(v_parto_id);

  -- últimos 10 dias com pesagem (soma das ordenhas do dia)
  with dias as (
    select data_controle as d, sum(litros) as l,
           string_agg(_rotulo_periodo(periodo) || ' ' || _fmt_num(litros), ' + ' order by periodo) filter (where periodo is not null) as detalhe,
           count(*) as n
    from controle_leite where vaca_id = p_vaca_id
    group by data_controle
    order by data_controle desc
    limit 10
  )
  select string_agg(format('- %s: %s L%s', _fmt_data(d), _fmt_num(l),
           case when n > 1 and detalhe is not null then ' (' || detalhe || ')' else '' end), chr(10) order by d desc),
         sum(l), max(d), count(*)
  into v_linhas, v_total, v_ultimo, v_dias
  from dias;

  if v_dias is null or v_dias = 0 then
    return format('Nenhum lançamento de leite da vaca %s na lactação atual.', v_numero);
  end if;

  if p_audio then
    return format('A vaca %s tem média de %s litros por dia pesado; a última pesagem foi em %s.',
      v_numero, _fmt_num(coalesce((v_ind->>'media')::numeric, v_total / v_dias)), _fmt_data(v_ultimo));
  end if;

  return format('*Vaca %s* — leite (últimos %s dias com pesagem)', v_numero, v_dias) || chr(10) || v_linhas
    || case when v_ind->>'media' is not null then
         chr(10) || chr(10) || format('Média: %s L/dia · Projeção 305 dias: %s L',
           _fmt_num((v_ind->>'media')::numeric), _fmt_num(round((v_ind->>'projecao_305')::numeric)))
       else '' end;
end;
$$;

-- ============================================================
-- Relatórios da fazenda
-- ============================================================

create or replace function _rel_producao(p_propriedade_id uuid, p_mensagem text, p_periodo_dias integer, p_audio boolean)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := _hoje_fazenda();
  v_per record;
  v_mes date := date_trunc('month', v_hoje)::date;
  v_total numeric;
  v_dias integer;
  v_pesagens integer;
  v_atual numeric; v_n_atual integer;
  v_anterior numeric; v_n_anterior integer;
  v_ultimos text;
  v_l text[] := '{}';
begin
  select * into v_per from _periodo_consulta(p_mensagem, p_periodo_dias, false);

  -- leite_diario_propriedade (0020) inclui lactações já arquivadas
  select sum(litros), count(*), sum(pesagens),
         sum(litros) filter (where data >= v_mes), count(*) filter (where data >= v_mes),
         sum(litros) filter (where data < v_mes), count(*) filter (where data < v_mes)
  into v_total, v_dias, v_pesagens, v_atual, v_n_atual, v_anterior, v_n_anterior
  from leite_diario_propriedade
  where propriedade_id = p_propriedade_id and data between v_per.inicio and v_hoje;

  if coalesce(v_dias, 0) = 0 then
    return format('Nenhum registro de leite (%s).', v_per.rotulo);
  end if;

  if v_per.rotulo = 'hoje' then
    return format('Produção de hoje: %s L em %s lançamento(s).', _fmt_num(v_total), v_pesagens);
  end if;

  if p_audio then
    return format('Produção, %s: %s litros, média de %s litros por dia.', v_per.rotulo, _fmt_num(v_total), _fmt_num(v_total / v_dias));
  end if;

  v_l := v_l || format('*Produção — %s*', v_per.rotulo);
  v_l := v_l || format('Total: %s L em %s dias com pesagem', _fmt_num(v_total), v_dias);
  if v_n_atual > 0 and v_n_anterior > 0 then
    v_l := v_l || ''::text;
    v_l := v_l || format('Mês atual: %s L (média %s L/dia)', _fmt_num(v_atual), _fmt_num(v_atual / v_n_atual));
    v_l := v_l || format('Mês anterior: %s L (média %s L/dia)', _fmt_num(v_anterior), _fmt_num(v_anterior / v_n_anterior));
  else
    v_l := v_l || format('Média: %s L/dia', _fmt_num(v_total / v_dias));
  end if;

  select string_agg(format('- %s: %s L', _fmt_data(data), _fmt_num(litros)), chr(10) order by data)
  into v_ultimos
  from (
    select data, litros from leite_diario_propriedade
    where propriedade_id = p_propriedade_id and data between v_per.inicio and v_hoje
    order by data desc limit 7
  ) u;
  v_l := v_l || ''::text;
  v_l := v_l || 'Últimos dias com pesagem:'::text;
  v_l := v_l || v_ultimos;

  return array_to_string(v_l, chr(10));
end;
$$;

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
  -- prenhezes confirmadas que ainda não viraram parto
  with prenhes as (
    select v.numero_identificacao as numero, v.status_produtivo, c.data_cobertura + 283 as parto
    from coberturas c join vacas v on v.id = c.vaca_id
    where v.propriedade_id = p_propriedade_id and c.diagnostico_prenhez = 'positivo'
      and not exists (select 1 from partos p where p.cobertura_id = c.id)
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
  from coberturas c join vacas v on v.id = c.vaca_id
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

create or replace function _rel_cadastro(p_propriedade_id uuid, p_audio boolean) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total integer;
  v_prod text;
  v_rep text;
  v_bezerros integer;
begin
  select count(*) into v_total from vacas where propriedade_id = p_propriedade_id;
  select string_agg(format('- %s: %s', _rotulo_status(coalesce(status_produtivo, 'não informado')), n), chr(10) order by n desc)
  into v_prod
  from (select status_produtivo, count(*) n from vacas where propriedade_id = p_propriedade_id group by 1) s;
  select string_agg(format('- %s: %s', _rotulo_status(coalesce(status_reprodutivo, 'não informado')), n), chr(10) order by n desc)
  into v_rep
  from (select status_reprodutivo, count(*) n from vacas where propriedade_id = p_propriedade_id group by 1) s;
  select count(*) into v_bezerros from bezerros
  where propriedade_id = p_propriedade_id and vaca_id_gerada is null and sexo is distinct from 'natimorto';

  if p_audio then
    return format('Você tem %s vacas cadastradas e %s bezerros.', v_total, v_bezerros);
  end if;

  return format('*Rebanho*: %s vacas e %s bezerros', v_total, v_bezerros) || chr(10) || chr(10)
    || 'Por status produtivo:' || chr(10) || coalesce(v_prod, '- nenhuma') || chr(10) || chr(10)
    || 'Por status reprodutivo:' || chr(10) || coalesce(v_rep, '- nenhuma');
end;
$$;

create or replace function _rel_financeiro(
  p_propriedade_id uuid,
  p_mensagem text,
  p_periodo_dias integer,
  p_tipo text,
  p_audio boolean
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := _hoje_fazenda();
  v_per record;
  v_tipo text := case when p_tipo in ('receita', 'despesa') then p_tipo end;
  v_receitas numeric;
  v_despesas numeric;
  v_n integer;
  v_cat text;
  v_l text[] := '{}';
begin
  select * into v_per from _periodo_consulta(p_mensagem, p_periodo_dias, true);

  select coalesce(sum(valor) filter (where tipo = 'receita'), 0), coalesce(sum(valor) filter (where tipo = 'despesa'), 0), count(*)
  into v_receitas, v_despesas, v_n
  from financeiro
  where propriedade_id = p_propriedade_id and data between v_per.inicio and v_hoje
    and (v_tipo is null or tipo = v_tipo);

  if v_n = 0 then
    return format('Nenhum lançamento financeiro (%s).', v_per.rotulo);
  end if;

  if v_tipo is null or v_tipo = 'receita' then
    v_l := v_l || format('Receitas: %s', _fmt_reais(v_receitas));
  end if;
  if v_tipo is null or v_tipo = 'despesa' then
    v_l := v_l || format('Despesas: %s', _fmt_reais(v_despesas));
  end if;
  if v_tipo is null then
    v_l := v_l || format('Saldo: %s', _fmt_reais(v_receitas - v_despesas));
  end if;

  if p_audio then
    return format('Financeiro, %s. ', v_per.rotulo) || array_to_string(v_l, '. ') || '.';
  end if;

  select string_agg(format('- %s - %s: %s', tipo, cat, _fmt_reais(total)), chr(10) order by tipo desc, total desc)
  into v_cat
  from (
    select tipo, coalesce(categoria, 'outros') cat, sum(valor) total
    from financeiro
    where propriedade_id = p_propriedade_id and data between v_per.inicio and v_hoje
      and (v_tipo is null or tipo = v_tipo)
    group by 1, 2
  ) c;

  return format('*Financeiro — %s*', v_per.rotulo) || chr(10) || chr(10)
    || array_to_string(v_l, chr(10)) || chr(10) || chr(10)
    || 'Por categoria:' || chr(10) || v_cat;
end;
$$;

-- ============================================================
-- Entrada única do bot pra consultas
-- ============================================================

create or replace function bot_consultar(
  p_telefone text,
  p_intencao text,
  p_entidades jsonb,
  p_mensagem text,
  p_audio boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_tipo text := lower(coalesce(p_entidades->>'tipo_relatorio', ''));
  v_numero_txt text := regexp_replace(coalesce(p_entidades->>'numero_vaca', ''), '\D', '', 'g');
  v_numero integer := case when v_numero_txt <> '' then v_numero_txt::integer end;
  v_periodo_dias integer := case when coalesce(p_entidades->>'periodo_dias', '') ~ '^\d+$' then (p_entidades->>'periodo_dias')::integer end;
  v_audio boolean := coalesce(p_audio, false);
  v_vaca_id uuid;
  v_texto text;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if p_intencao = 'consultar_financeiro' then
    v_texto := _rel_financeiro(v_propriedade_id, p_mensagem, v_periodo_dias, p_entidades->>'tipo_financeiro', v_audio);
  elsif v_tipo = 'cadastro' then
    v_texto := _rel_cadastro(v_propriedade_id, v_audio);
  elsif v_numero is not null then
    select id into v_vaca_id from vacas
    where propriedade_id = v_propriedade_id and numero_identificacao = v_numero;
    if v_vaca_id is null then
      return jsonb_build_object('ok', false, 'mensagem',
        format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', v_numero));
    end if;
    v_texto := case
      when v_tipo = 'reprodutivo' then _rel_vaca_reproducao(v_vaca_id, v_audio)
      when v_tipo = 'leite' then _rel_vaca_leite(v_vaca_id, v_audio)
      else _rel_vaca_reproducao(v_vaca_id, v_audio) || case when v_audio then ' ' else chr(10) || chr(10) end || _rel_vaca_leite(v_vaca_id, v_audio)
    end;
  elsif v_tipo = 'reprodutivo' then
    v_texto := _rel_reproducao_fazenda(v_propriedade_id, v_audio);
  elsif v_tipo = 'geral' then
    v_texto := _rel_producao(v_propriedade_id, p_mensagem, v_periodo_dias, v_audio)
      || case when v_audio then ' ' else chr(10) || chr(10) end || _rel_reproducao_fazenda(v_propriedade_id, v_audio);
  else
    v_texto := _rel_producao(v_propriedade_id, p_mensagem, v_periodo_dias, v_audio);
  end if;

  return jsonb_build_object('ok', true, 'mensagem', v_texto);
end;
$$;

do $$
declare
  v_assinatura text;
begin
  foreach v_assinatura in array array[
    '_rel_vaca_reproducao(uuid, boolean)',
    '_rel_vaca_leite(uuid, boolean)',
    '_rel_producao(uuid, text, integer, boolean)',
    '_rel_reproducao_fazenda(uuid, boolean)',
    '_rel_cadastro(uuid, boolean)',
    '_rel_financeiro(uuid, text, integer, text, boolean)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_assinatura);
  end loop;
end $$;

revoke execute on function bot_consultar(text, text, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function bot_consultar(text, text, jsonb, text, boolean) to service_role;
