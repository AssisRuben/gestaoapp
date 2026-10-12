-- Performance por ENTIDADE (associação, cooperativa…) — 12/10/2026.
--
-- Vínculo entidade × fazenda = as entregas de doses (decisão do usuário): a fazenda conta em toda
-- entidade por onde recebeu doses (entregas_doses.entidade_id, 0048). Os índices da entidade saem
-- dos índices das fazendas, pela mesma régua do ranking (calcular_indicadores, 0019):
--   produção/dia e vacas em lactação: soma; L/vaca/dia: produção ÷ vacas em lactação das fazendas
--   com pesagem; receita/despesa por mês: soma; custo e receita por litro: soma das despesas
--   (receitas) ÷ litros do mês, só das fazendas com produção; IEP: média dos partos; programa de
--   sêmen: concepção = prenhezes ÷ diagnosticadas, doses por prenhez, gestações, nascidos.
-- Só leitura, pro painel do gestor (service role; o layout já validou isGestor()).

create or replace function indicadores_entidades_fazendas()
returns table (
  entidade_id uuid,
  entidade_nome text,
  responsavel text,
  telefone text,
  propriedade_id uuid,
  nome_propriedade text,
  vacas_lactacao integer,
  litros_vaca_dia numeric,
  producao_dia numeric,
  receita_mensal numeric,
  despesa_mensal numeric,
  custo_litro numeric,
  iep_soma numeric,
  iep_qtd integer,
  doses_recebidas integer,
  doses_pendentes integer,
  kits integer,
  doses_usadas integer,
  prenhezes integer,
  negativos integer,
  gestacoes_em_curso integer,
  nascimentos integer
)
language sql
stable
security definer
set search_path = public
as $$
  with vinculos as (
    select e.entidade_id, e.propriedade_id,
           sum(e.quantidade) filter (where e.recebido_em is not null)::integer as doses_recebidas,
           sum(e.quantidade) filter (where e.recebido_em is null)::integer as doses_pendentes,
           sum(e.kits)::integer as kits
    from entregas_doses e
    where e.entidade_id is not null
    group by e.entidade_id, e.propriedade_id
  )
  select en.id, en.nome, en.responsavel, en.telefone,
         p.id, p.nome_propriedade,
         i.vacas_lactacao, i.litros_vaca_dia, i.producao_dia, i.receita_mensal, i.despesa_mensal, i.custo_litro,
         (select sum(pa.iep) from partos pa join vacas v on v.id = pa.vaca_id
           where v.propriedade_id = p.id and pa.ativa and pa.iep is not null),
         (select count(*)::integer from partos pa join vacas v on v.id = pa.vaca_id
           where v.propriedade_id = p.id and pa.ativa and pa.iep is not null),
         coalesce(vi.doses_recebidas, 0), coalesce(vi.doses_pendentes, 0), coalesce(vi.kits, 0),
         coalesce(r.doses_usadas, 0), coalesce(r.prenhezes, 0), coalesce(r.negativos, 0),
         coalesce(r.gestacoes_em_curso, 0), coalesce(r.nascimentos, 0)
  from vinculos vi
  join entidades en on en.id = vi.entidade_id
  join propriedades p on p.id = vi.propriedade_id
  cross join lateral calcular_indicadores(p.id, _hoje_fazenda()) i
  left join indicadores_reprodutivos_programa r on r.propriedade_id = p.id
  order by en.nome, p.nome_propriedade;
$$;

create or replace function indicadores_entidades()
returns table (
  entidade_id uuid,
  entidade_nome text,
  responsavel text,
  telefone text,
  fazendas integer,
  vacas_lactacao integer,
  producao_dia numeric,
  litros_vaca_dia numeric,
  receita_mensal numeric,
  despesa_mensal numeric,
  custo_litro numeric,
  receita_litro numeric,
  iep_medio numeric,
  doses_recebidas integer,
  doses_pendentes integer,
  kits integer,
  taxa_concepcao numeric,
  doses_por_prenhez numeric,
  gestacoes_em_curso integer,
  nascimentos integer
)
language sql
stable
security definer
set search_path = public
as $$
  with f as (select * from indicadores_entidades_fazendas())
  select entidade_id, entidade_nome, responsavel, telefone,
         count(*)::integer,
         sum(vacas_lactacao)::integer,
         round(sum(producao_dia), 1),
         round(sum(producao_dia) / nullif(sum(vacas_lactacao) filter (where litros_vaca_dia is not null), 0), 2),
         round(sum(receita_mensal), 2),
         round(sum(despesa_mensal), 2),
         round(sum(despesa_mensal) filter (where producao_dia > 0)
               / nullif(sum(producao_dia) filter (where producao_dia > 0) * 30, 0), 2),
         round(sum(receita_mensal) filter (where producao_dia > 0)
               / nullif(sum(producao_dia) filter (where producao_dia > 0) * 30, 0), 2),
         round(sum(iep_soma) / nullif(sum(iep_qtd), 0), 0),
         sum(doses_recebidas)::integer,
         sum(doses_pendentes)::integer,
         sum(kits)::integer,
         round(sum(prenhezes) * 100.0 / nullif(sum(prenhezes) + sum(negativos), 0), 1),
         round(sum(doses_usadas)::numeric / nullif(sum(prenhezes), 0), 2),
         sum(gestacoes_em_curso)::integer,
         sum(nascimentos)::integer
  from f
  group by entidade_id, entidade_nome, responsavel, telefone
  order by entidade_nome;
$$;

revoke execute on function indicadores_entidades_fazendas() from public, anon, authenticated;
revoke execute on function indicadores_entidades() from public, anon, authenticated;
