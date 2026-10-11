-- Lembretes diários pelo WhatsApp (workflow fazenda-leite-lembretes.json, 6h de Fortaleza).
--
-- Só pra fazenda que LIGOU (propriedades.lembretes_whatsapp, desligado por padrão — é mensagem que
-- o produtor não pediu naquela hora) e só quando há pendência; nada de "bom dia" vazio.
-- Conteúdo (mesmas constantes da regra 7 do CLAUDE.md):
--   - secar: prenhe, em lactação, secagem nos próximos 7 dias ou atrasada
--   - diagnóstico: cobertura pendente com 30+ dias (já dá pra fazer o toque/ultrassom)
--   - parto: previsto nos próximos 7 dias (ou passado há até 15 dias e não registrado)
--   - leite: fazenda que lança leite e está há 3+ dias sem lançamento
-- marcar_lembrete_enviado grava o dia do envio; lembretes_do_dia não devolve fazenda que já
-- recebeu hoje (rodar o workflow duas vezes não duplica).

alter table propriedades add column if not exists lembretes_whatsapp boolean not null default false;
alter table propriedades add column if not exists lembretes_ultimo_envio date;

create or replace function _lista_curta(p_itens text[], p_max integer default 5) returns text
language sql
immutable
as $$
  select case
    when coalesce(array_length(p_itens, 1), 0) = 0 then null
    when array_length(p_itens, 1) <= p_max then array_to_string(p_itens, ', ')
    else array_to_string(p_itens[1:p_max], ', ') || format(' e mais %s', array_length(p_itens, 1) - p_max)
  end;
$$;

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
      from coberturas c join vacas v on v.id = c.vaca_id
      where v.propriedade_id = v_prop.id and c.diagnostico_prenhez = 'positivo'
        and not exists (select 1 from partos p where p.cobertura_id = c.id)
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
    from coberturas c join vacas v on v.id = c.vaca_id
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

create or replace function marcar_lembrete_enviado(p_propriedade_id uuid) returns void
language sql
security definer
set search_path = public
as $$
  update propriedades set lembretes_ultimo_envio = _hoje_fazenda() where id = p_propriedade_id;
$$;

revoke execute on function lembretes_do_dia() from public, anon, authenticated;
revoke execute on function marcar_lembrete_enviado(uuid) from public, anon, authenticated;
grant execute on function lembretes_do_dia() to service_role;
grant execute on function marcar_lembrete_enviado(uuid) to service_role;
