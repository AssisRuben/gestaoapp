-- Alertas reprodutivos do painel do gestor (aba Alertas), uma linha por vaca/entrega em atraso.
-- Mesmas constantes da regra 7 do CLAUDE.md (gestação 283 dias, secagem 60 dias antes do parto).
--
--   diagnostico_atrasado  cobertura pendente há mais de 45 dias
--   secagem_atrasada      prenhe, ainda em lactação, data de secar já passou
--   parto_atrasado        parto previsto há mais de 15 dias e nenhum parto registrado
--   vazia_muito_tempo     em lactação há mais de 120 dias sem prenhez confirmada
--   doses_nao_confirmadas entrega do programa de sêmen aguardando confirmação há mais de 7 dias
--
-- Lido pelo site com a service role (cache do painel do gestor, que já validou isGestor()).

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
    from coberturas c join vacas v on v.id = c.vaca_id
    where c.diagnostico_prenhez = 'positivo'
      and not exists (select 1 from partos p where p.cobertura_id = c.id)
  )
  select v.propriedade_id, 'diagnostico_atrasado', v.id, v.numero_identificacao, c.data_cobertura,
         (select d from hoje) - c.data_cobertura
  from coberturas c join vacas v on v.id = c.vaca_id
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
