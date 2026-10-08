-- Adesão ao programa + linha de base: a "foto" da propriedade no momento em que entra no
-- programa, contra a qual a evolução (produtividade, rebanho, custo) é medida depois.
--
-- A linha de base é GRAVADA (congelada), não recalculada: se fosse recalculada, qualquer
-- lançamento retroativo mudaria o ponto de partida e a comparação perderia sentido. O sistema
-- sugere os valores (calcular_indicadores) e o gestor revisa antes de salvar — necessário
-- porque muitas fazendas entram no programa junto com o sistema, sem histórico lançado, e aí a
-- linha de base vem do diagnóstico feito na visita.
--
-- Mesma régua pra linha de base e pro valor atual (calcular_indicadores), pra comparação ser
-- justa:
--   - rebanho: status ATUAL das vacas (vacas não guarda histórico de status — numa adesão com
--     data passada, os números de rebanho sugeridos são os de hoje; o gestor corrige se precisar)
--   - litros/vaca/dia: média das pesagens (soma por vaca e dia) nos 30 dias até a data —
--     funciona tanto com controle diário quanto com controle leiteiro mensal
--   - produção/dia do rebanho: litros/vaca/dia × vacas em lactação
--   - receita/despesa mensal: média dos meses COM lançamento nos 12 meses até a data (dividir
--     sempre por 12 subestimaria fazenda que começou a lançar há pouco)
--   - custo por litro: despesa mensal ÷ (produção/dia × 30)

create table adesoes_programa (
  propriedade_id uuid primary key references propriedades(id) on delete cascade,
  data_adesao date not null,
  total_animais integer,
  matrizes integer,          -- vacas que já pariram (em lactação + secas)
  vacas_lactacao integer,
  novilhas integer,
  bezerras integer,          -- bezerras vivas ainda não cadastradas como vaca
  litros_vaca_dia numeric,
  producao_dia numeric,
  receita_mensal numeric,
  despesa_mensal numeric,
  custo_litro numeric,
  observacao text,
  registrado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table adesoes_programa enable row level security;

create policy "fazenda e gestor veem adesao"
  on adesoes_programa for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = adesoes_programa.propriedade_id and up.usuario_id = auth.uid()
    )
    or exists (select 1 from gestores g where g.usuario_id = auth.uid())
  );

create policy "gestor insere adesao"
  on adesoes_programa for insert
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

create policy "gestor atualiza adesao"
  on adesoes_programa for update
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()))
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

create policy "gestor deleta adesao"
  on adesoes_programa for delete
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

-- Uso interno (lê qualquer fazenda sem checar acesso): sem execute pra anon/authenticated.
-- Quem chama: sugerir_linha_base (checa gestor) e o site do gestor via service role.
create or replace function calcular_indicadores(p_propriedade_id uuid, p_data date)
returns table (
  total_animais integer,
  matrizes integer,
  vacas_lactacao integer,
  novilhas integer,
  bezerras integer,
  litros_vaca_dia numeric,
  producao_dia numeric,
  receita_mensal numeric,
  despesa_mensal numeric,
  custo_litro numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with
  rebanho as (
    select
      count(*) filter (where status_produtivo = 'lactacao')::integer as vacas_lactacao,
      count(*) filter (where status_produtivo in ('lactacao', 'seca'))::integer as matrizes,
      count(*) filter (where status_produtivo = 'novilha')::integer as novilhas,
      count(*)::integer as vacas
    from vacas where propriedade_id = p_propriedade_id
  ),
  crias as (
    select
      count(*) filter (where sexo is distinct from 'natimorto')::integer as vivas,
      count(*) filter (where sexo = 'femea')::integer as bezerras
    from bezerros
    where propriedade_id = p_propriedade_id and vaca_id_gerada is null
  ),
  pesagens as (
    select l.vaca_id, l.data_controle, sum(l.litros) as litros
    from (
      select vaca_id, data_controle, litros from controle_leite
      union all
      select vaca_id, data_controle, litros from controle_leite_historico
    ) l
    join vacas v on v.id = l.vaca_id
    where v.propriedade_id = p_propriedade_id
      and l.data_controle > p_data - 30 and l.data_controle <= p_data
    group by l.vaca_id, l.data_controle
  ),
  leite as (
    select round(avg(litros), 2) as litros_vaca_dia from pesagens
  ),
  dinheiro as (
    select
      coalesce(sum(valor) filter (where tipo = 'receita'), 0) as receita,
      coalesce(sum(valor) filter (where tipo = 'despesa'), 0) as despesa,
      count(distinct date_trunc('month', data)) as meses
    from financeiro
    where propriedade_id = p_propriedade_id
      and data > (p_data - interval '12 months')::date and data <= p_data
  ),
  base as (
    select
      r.vacas + c.vivas as total_animais,
      r.matrizes,
      r.vacas_lactacao,
      r.novilhas,
      c.bezerras,
      l.litros_vaca_dia,
      round(l.litros_vaca_dia * r.vacas_lactacao, 1) as producao_dia,
      case when d.meses > 0 then round(d.receita / d.meses, 2) end as receita_mensal,
      case when d.meses > 0 then round(d.despesa / d.meses, 2) end as despesa_mensal
    from rebanho r, crias c, leite l, dinheiro d
  )
  select
    total_animais, matrizes, vacas_lactacao, novilhas, bezerras,
    litros_vaca_dia, producao_dia, receita_mensal, despesa_mensal,
    case when producao_dia > 0 then round(despesa_mensal / (producao_dia * 30), 2) end as custo_litro
  from base;
$$;

revoke execute on function calcular_indicadores(uuid, date) from public, anon, authenticated;

-- Sugestão de linha de base pro formulário de adesão do gestor.
create or replace function sugerir_linha_base(p_propriedade_id uuid, p_data date)
returns table (
  total_animais integer,
  matrizes integer,
  vacas_lactacao integer,
  novilhas integer,
  bezerras integer,
  litros_vaca_dia numeric,
  producao_dia numeric,
  receita_mensal numeric,
  despesa_mensal numeric,
  custo_litro numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from gestores where usuario_id = auth.uid()) then
    raise exception 'só o gestor do programa pode fazer isso';
  end if;

  return query select * from calcular_indicadores(p_propriedade_id, p_data);
end;
$$;

-- Indicadores de hoje de todas as fazendas que aderiram, pro comparativo do gestor (lido com
-- service role, como o resto do painel do gestor).
create or replace function indicadores_atuais_programa()
returns table (
  propriedade_id uuid,
  total_animais integer,
  matrizes integer,
  vacas_lactacao integer,
  novilhas integer,
  bezerras integer,
  litros_vaca_dia numeric,
  producao_dia numeric,
  receita_mensal numeric,
  despesa_mensal numeric,
  custo_litro numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select a.propriedade_id, i.*
  from adesoes_programa a
  cross join lateral calcular_indicadores(a.propriedade_id, current_date) i;
$$;

revoke execute on function indicadores_atuais_programa() from public, anon, authenticated;
