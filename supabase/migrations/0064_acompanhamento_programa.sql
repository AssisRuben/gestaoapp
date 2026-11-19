-- Acompanhamento do programa no painel do gestor (19/11/2026).
--
-- 1. programa_inseminacoes_mes: inseminações com dose do programa por fazenda e mês da cobertura,
--    com o resultado (prenhe, vazia, aguardando diagnóstico). Mesma base de
--    indicadores_reprodutivos_programa (coberturas + coberturas_historico com dose_programa), então a
--    soma dos meses bate com "Inseminações" da aba Programa.
-- 2. botijao_situacao: último abastecimento do botijão de cada fazenda, nível, dias desde então e
--    gasto dos últimos 12 meses.
-- 3. alertas_reprodutivos ganha 'botijao_sem_abastecer': fazenda que já registrou abastecimento e está
--    há mais de 60 dias sem registrar outro (decisão do usuário, 19/11/2026). Fazenda que nunca
--    registrou não entra — não dá pra saber se ela tem botijão.

create or replace view programa_inseminacoes_mes with (security_invoker = true) as
with ins as (
  select v.propriedade_id, c.data_cobertura, c.diagnostico_prenhez
  from coberturas c join vacas v on v.id = c.vaca_id
  where c.dose_programa
  union all
  select v.propriedade_id, h.data_cobertura, h.diagnostico_prenhez
  from coberturas_historico h join vacas v on v.id = h.vaca_id
  where h.dose_programa
)
select
  propriedade_id,
  date_trunc('month', data_cobertura)::date as mes,
  count(*)::integer as inseminacoes,
  count(*) filter (where diagnostico_prenhez = 'positivo')::integer as prenhezes,
  count(*) filter (where diagnostico_prenhez = 'negativo')::integer as negativos,
  count(*) filter (where diagnostico_prenhez = 'pendente' or diagnostico_prenhez is null)::integer as pendentes
from ins
group by propriedade_id, date_trunc('month', data_cobertura);

create or replace view botijao_situacao with (security_invoker = true) as
select
  u.propriedade_id,
  u.data as ultimo_abastecimento,
  u.nivel_cm as ultimo_nivel_cm,
  _hoje_fazenda() - u.data as dias_desde,
  a.abastecimentos_12m,
  a.gasto_12m
from (
  select distinct on (propriedade_id) propriedade_id, data, nivel_cm
  from botijao_abastecimentos
  order by propriedade_id, data desc, created_at desc
) u
join (
  select propriedade_id,
         count(*) filter (where data > _hoje_fazenda() - 365)::integer as abastecimentos_12m,
         coalesce(sum(valor) filter (where data > _hoje_fazenda() - 365), 0) as gasto_12m
  from botijao_abastecimentos
  group by propriedade_id
) a on a.propriedade_id = u.propriedade_id;

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
  where e.recebido_em is null and (select d from hoje) - e.data_entrega > 7

  union all
  select b.propriedade_id, 'botijao_sem_abastecer', null, null, max(b.data),
         (select d from hoje) - max(b.data)
  from botijao_abastecimentos b
  group by b.propriedade_id
  having (select d from hoje) - max(b.data) > 60;
$$;

revoke execute on function alertas_reprodutivos() from public, anon, authenticated;
