-- Dados agregados pras telas do gestor (Visão geral, Ranking, Alertas), que até aqui usavam
-- dados fictícios. Agregar no banco em vez de baixar as tabelas cruas: o PostgREST corta cada
-- consulta em 1000 linhas (max_rows), e controle_leite de várias fazendas passa disso rápido —
-- os totais sairiam errados sem nenhum erro. As views abaixo têm uma linha por fazenda/dia
-- (o site ainda pagina a leitura, mas o volume cai muito).
--
-- Todas security_invoker: o gestor lê pelo service role (como o resto do painel dele); um
-- usuário de fazenda que consultar direto só vê as próprias linhas, pelo RLS das tabelas base.

-- Leite por fazenda e dia, incluindo lactações já arquivadas. `pesagens` = vacas pesadas no
-- dia, pra calcular litros/vaca/dia como em calcular_indicadores (0019): soma dos litros ÷ soma
-- das pesagens = média das pesagens por vaca/dia.
create view leite_diario_propriedade with (security_invoker = true) as
select
  v.propriedade_id,
  l.data_controle as data,
  sum(l.litros) as litros,
  count(distinct l.vaca_id)::integer as pesagens
from (
  select vaca_id, data_controle, litros from controle_leite
  union all
  select vaca_id, data_controle, litros from controle_leite_historico
) l
join vacas v on v.id = l.vaca_id
group by v.propriedade_id, l.data_controle;

create view financeiro_diario_propriedade with (security_invoker = true) as
select
  propriedade_id,
  data,
  coalesce(sum(valor) filter (where tipo = 'receita'), 0) as receita,
  coalesce(sum(valor) filter (where tipo = 'despesa'), 0) as despesa
from financeiro
group by propriedade_id, data;

-- Uma linha por fazenda: rebanho, últimos lançamentos (alertas), IEP e o WhatsApp de contato.
create view resumo_fazendas with (security_invoker = true) as
select
  p.id as propriedade_id,
  p.nome_propriedade,
  p.latitude,
  p.longitude,
  (select count(*) from vacas v where v.propriedade_id = p.id)::integer as vacas_total,
  (select count(*) from vacas v
    where v.propriedade_id = p.id and v.status_produtivo = 'lactacao')::integer as vacas_lactacao,
  -- mesma regra do dashboard da fazenda: bezerro que virou vaca já está em vacas; natimorto não conta
  (select count(*) from bezerros b
    where b.propriedade_id = p.id and b.vaca_id_gerada is null
      and b.sexo is distinct from 'natimorto')::integer as bezerros_vivos,
  (select max(l.data) from leite_diario_propriedade l where l.propriedade_id = p.id) as ultimo_leite,
  (select max(f.data) from financeiro f where f.propriedade_id = p.id) as ultimo_financeiro,
  (select sum(x.iep) from (
     select pa.iep from partos pa join vacas v on v.id = pa.vaca_id where v.propriedade_id = p.id
     union all
     select ph.iep from partos_historico ph join vacas v on v.id = ph.vaca_id where v.propriedade_id = p.id
   ) x)::integer as iep_soma,
  (select count(x.iep) from (
     select pa.iep from partos pa join vacas v on v.id = pa.vaca_id where v.propriedade_id = p.id
     union all
     select ph.iep from partos_historico ph join vacas v on v.id = ph.vaca_id where v.propriedade_id = p.id
   ) x)::integer as iep_qtd,
  (select u.telefone from usuarios_whatsapp u
    where u.propriedade_id = p.id and u.ativo
    order by u.created_at limit 1) as telefone
from propriedades p;

-- Indicadores de hoje de TODAS as fazendas (o ranking compara todas, não só as do programa).
-- Mesma régua de calcular_indicadores (0019). Só service role.
create or replace function indicadores_todas_fazendas()
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
  select p.id, i.*
  from propriedades p
  cross join lateral calcular_indicadores(p.id, current_date) i;
$$;

revoke execute on function indicadores_todas_fazendas() from public, anon, authenticated;
