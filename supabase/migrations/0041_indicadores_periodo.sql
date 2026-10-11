-- Ranking do gestor com período escolhido (De/Até). Mesma régua de calcular_indicadores (0019) pro
-- leite — média das pesagens por vaca/dia (inclui lactações arquivadas) × vacas em lactação —, só
-- que no intervalo pedido em vez de "30 dias até a data". Custo por litro do período = despesas do
-- período ÷ litros estimados do período (produção/dia × nº de dias).
--
-- Sem período escolhido o ranking continua usando indicadores_todas_fazendas() (30 dias de leite,
-- 12 meses de despesa), igual à linha de base do programa.
-- Rebanho (vacas em lactação) é o status ATUAL — não há histórico de status.
-- Lido com a service role pelo painel do gestor (que já validou isGestor()).

create or replace function indicadores_periodo(p_inicio date, p_fim date)
returns table (
  propriedade_id uuid,
  vacas_lactacao integer,
  litros_vaca_dia numeric,
  producao_dia numeric,
  receita_periodo numeric,
  despesa_periodo numeric,
  custo_litro numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with
  rebanho as (
    select v.propriedade_id, count(*) filter (where v.status_produtivo = 'lactacao')::integer as vacas_lactacao
    from vacas v
    group by v.propriedade_id
  ),
  pesagens as (
    select v.propriedade_id, l.vaca_id, l.data_controle, sum(l.litros) as litros
    from (
      select vaca_id, data_controle, litros from controle_leite
      union all
      select vaca_id, data_controle, litros from controle_leite_historico
    ) l
    join vacas v on v.id = l.vaca_id
    where l.data_controle between p_inicio and p_fim
    group by v.propriedade_id, l.vaca_id, l.data_controle
  ),
  leite as (
    select propriedade_id, round(avg(litros), 2) as litros_vaca_dia from pesagens group by propriedade_id
  ),
  dinheiro as (
    select f.propriedade_id,
           coalesce(sum(f.valor) filter (where f.tipo = 'receita'), 0) as receita,
           coalesce(sum(f.valor) filter (where f.tipo = 'despesa'), 0) as despesa
    from financeiro f
    where f.data between p_inicio and p_fim
    group by f.propriedade_id
  ),
  base as (
    select p.id as propriedade_id,
           coalesce(r.vacas_lactacao, 0) as vacas_lactacao,
           l.litros_vaca_dia,
           round(l.litros_vaca_dia * coalesce(r.vacas_lactacao, 0), 1) as producao_dia,
           d.receita, d.despesa
    from propriedades p
    left join rebanho r on r.propriedade_id = p.id
    left join leite l on l.propriedade_id = p.id
    left join dinheiro d on d.propriedade_id = p.id
  )
  select propriedade_id, vacas_lactacao, litros_vaca_dia, producao_dia,
         receita, despesa,
         case when producao_dia > 0 and despesa > 0
              then round(despesa / (producao_dia * (p_fim - p_inicio + 1)), 2) end
  from base
  where p_fim >= p_inicio;
$$;

revoke execute on function indicadores_periodo(date, date) from public, anon, authenticated;
