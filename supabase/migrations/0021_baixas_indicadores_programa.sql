-- Programa de sêmen, parte 2: baixa de doses perdidas e indicadores reprodutivos do programa.
--
-- Baixa: dose que sai do saldo sem virar inseminação (danificada no botijão, falha no
-- descongelamento, vencida/descartada, repassada a outra propriedade). Sem isso a dose ficava no
-- saldo pra sempre e o "% de uso" do programa nunca fechava. A fazenda registra (é quem sabe da
-- perda) e pode desfazer um lançamento errado; o gestor vê tudo.
--
-- Indicadores: calculados sempre a partir das coberturas com dose_programa (vivas + arquivadas em
-- coberturas_historico) e dos bezerros nascidos delas.

-- ============================================================
-- baixas_doses
-- ============================================================

create table baixas_doses (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  touro_id uuid not null references touros(id),
  quantidade integer not null check (quantidade > 0),
  motivo text not null check (motivo in ('perda', 'descarte', 'transferencia', 'outro')),
  data_baixa date not null,
  observacao text,
  registrado_por uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now()
);

create index idx_baixas_doses_propriedade on baixas_doses (propriedade_id, touro_id);

alter table baixas_doses enable row level security;

-- Só leitura via RLS; escrita só pelas funções abaixo (que conferem saldo).
create policy "fazenda e gestor veem baixas"
  on baixas_doses for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = baixas_doses.propriedade_id and up.usuario_id = auth.uid()
    )
    or exists (select 1 from gestores g where g.usuario_id = auth.uid())
  );

-- ============================================================
-- saldo com baixas
-- ============================================================

-- A coluna nova (baixas) muda a posição de saldo — create or replace view não permite, então
-- recria. Nada no banco depende da view.
drop view saldo_doses;

create view saldo_doses with (security_invoker = true) as
with entregue as (
  select
    propriedade_id,
    touro_id,
    coalesce(sum(quantidade) filter (where recebido_em is not null), 0)::integer as recebidas,
    coalesce(sum(quantidade) filter (where recebido_em is null), 0)::integer as a_receber
  from entregas_doses
  group by propriedade_id, touro_id
),
usado as (
  select v.propriedade_id, u.touro_id, count(*)::integer as utilizadas
  from (
    select vaca_id, touro_id from coberturas where dose_programa
    union all
    select vaca_id, touro_id from coberturas_historico where dose_programa
  ) u
  join vacas v on v.id = u.vaca_id
  group by v.propriedade_id, u.touro_id
),
baixado as (
  select propriedade_id, touro_id, sum(quantidade)::integer as baixas
  from baixas_doses
  group by propriedade_id, touro_id
),
chaves as (
  select propriedade_id, touro_id from entregue
  union
  select propriedade_id, touro_id from usado
  union
  select propriedade_id, touro_id from baixado
)
select
  k.propriedade_id,
  k.touro_id,
  coalesce(e.recebidas, 0) as recebidas,
  coalesce(e.a_receber, 0) as a_receber,
  coalesce(u.utilizadas, 0) as utilizadas,
  coalesce(b.baixas, 0) as baixas,
  coalesce(e.recebidas, 0) - coalesce(u.utilizadas, 0) - coalesce(b.baixas, 0) as saldo
from chaves k
left join entregue e on e.propriedade_id = k.propriedade_id and e.touro_id = k.touro_id
left join usado u on u.propriedade_id = k.propriedade_id and u.touro_id = k.touro_id
left join baixado b on b.propriedade_id = k.propriedade_id and b.touro_id = k.touro_id;

-- Mesma checagem de 0018, agora descontando as baixas. p_doses = quantas doses o lançamento vai
-- consumir (1 numa inseminação, N numa baixa).
drop function _garantir_saldo_dose(uuid, uuid, uuid);

create or replace function _garantir_saldo_dose(
  p_propriedade_id uuid,
  p_touro_id uuid,
  p_ignorar_cobertura_id uuid default null,
  p_doses integer default 1
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recebidas integer;
  v_utilizadas integer;
  v_baixas integer;
begin
  -- trava as entregas daquele touro/fazenda: dois lançamentos simultâneos não gastam a mesma dose
  perform 1 from entregas_doses
  where propriedade_id = p_propriedade_id and touro_id = p_touro_id
  for update;

  select coalesce(sum(quantidade), 0) into v_recebidas
  from entregas_doses
  where propriedade_id = p_propriedade_id and touro_id = p_touro_id and recebido_em is not null;

  select count(*) into v_utilizadas
  from (
    select c.id, c.vaca_id from coberturas c
    where c.touro_id = p_touro_id and c.dose_programa
      and c.id is distinct from p_ignorar_cobertura_id
    union all
    select h.id, h.vaca_id from coberturas_historico h
    where h.touro_id = p_touro_id and h.dose_programa
  ) u
  join vacas v on v.id = u.vaca_id
  where v.propriedade_id = p_propriedade_id;

  select coalesce(sum(quantidade), 0) into v_baixas
  from baixas_doses
  where propriedade_id = p_propriedade_id and touro_id = p_touro_id;

  if v_recebidas - v_utilizadas - v_baixas < p_doses then
    if exists (
      select 1 from entregas_doses
      where propriedade_id = p_propriedade_id and touro_id = p_touro_id and recebido_em is null
    ) then
      raise exception 'sem saldo de doses desse touro — confirme o recebimento da entrega pendente antes de usar';
    end if;
    raise exception 'sem saldo de doses desse touro no programa (disponível: %)',
      greatest(v_recebidas - v_utilizadas - v_baixas, 0);
  end if;
end;
$$;

revoke execute on function _garantir_saldo_dose(uuid, uuid, uuid, integer) from public, anon, authenticated;

create or replace function registrar_baixa_doses(
  p_propriedade_id uuid,
  p_touro_id uuid,
  p_quantidade integer,
  p_motivo text,
  p_data_baixa date,
  p_observacao text default null
) returns baixas_doses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baixa baixas_doses;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'a quantidade deve ser maior que zero';
  end if;

  if p_motivo not in ('perda', 'descarte', 'transferencia', 'outro') then
    raise exception 'motivo inválido: %', p_motivo;
  end if;

  perform _garantir_saldo_dose(p_propriedade_id, p_touro_id, null, p_quantidade);

  insert into baixas_doses (propriedade_id, touro_id, quantidade, motivo, data_baixa, observacao)
  values (p_propriedade_id, p_touro_id, p_quantidade, p_motivo, p_data_baixa, nullif(p_observacao, ''))
  returning * into v_baixa;

  return v_baixa;
end;
$$;

-- Desfazer uma baixa lançada por engano devolve as doses ao saldo (nunca deixa saldo negativo).
create or replace function deletar_baixa_doses(p_baixa_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
begin
  select propriedade_id into v_propriedade_id from baixas_doses where id = p_baixa_id;

  if v_propriedade_id is null then
    raise exception 'baixa não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  delete from baixas_doses where id = p_baixa_id;
end;
$$;

-- ============================================================
-- bezerros: marca de nascido de dose do programa
-- ============================================================

-- bezerros.touro_id (0018) diz o pai, mas não se a dose era do programa — o produtor pode ter
-- comprado sêmen do mesmo touro por conta própria.
alter table bezerros add column dose_programa boolean not null default false;

-- Igual à versão de 0018_programa_semen.sql, com duas mudanças: grava bezerros.dose_programa e
-- não reaproveita cobertura que já gerou outro parto (ver comentário na busca da cobertura).
create or replace function registrar_parto(
  p_vaca_id uuid,
  p_data_parto date,
  p_numero_bezerro integer default null,
  p_sexo_bezerro text default null
) returns partos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_parto_anterior partos;
  v_iep integer;
  v_cobertura_id uuid;
  v_touro_id uuid;
  v_dose_programa boolean;
  v_novo_parto partos;
  v_numero_bezerro integer;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  -- fecha a lactação anterior (se existir) e calcula o IEP
  select * into v_parto_anterior
  from partos where vaca_id = p_vaca_id and ativa = true
  order by data_parto desc limit 1;

  if v_parto_anterior.id is not null then
    v_iep := p_data_parto - v_parto_anterior.data_parto;
    update partos set ativa = false where id = v_parto_anterior.id;
  else
    v_iep := null;
  end if;

  -- cobertura confirmada mais recente dessa vaca QUE AINDA NÃO GEROU PARTO. Antes pegava a
  -- positiva mais recente mesmo já usada: num segundo parto sem cobertura nova registrada (ex.:
  -- monta natural), o bezerro herdava o touro — e a dose do programa — do parto anterior.
  select c.id, c.touro_id, c.dose_programa into v_cobertura_id, v_touro_id, v_dose_programa
  from coberturas c
  where c.vaca_id = p_vaca_id and c.diagnostico_prenhez = 'positivo'
    and not exists (select 1 from partos p where p.cobertura_id = c.id)
    and not exists (select 1 from partos_historico ph where ph.cobertura_id = c.id)
  order by c.data_cobertura desc limit 1;

  insert into partos (vaca_id, cobertura_id, data_parto, iep, ativa)
  values (p_vaca_id, v_cobertura_id, p_data_parto, v_iep, true)
  returning * into v_novo_parto;

  update vacas set status_produtivo = 'lactacao', status_reprodutivo = 'vazia'
  where id = p_vaca_id;

  -- Arquiva a lactação que acabou de fechar: leite, coberturas do período e o
  -- parto em si saem das tabelas principais.
  if v_parto_anterior.id is not null then
    insert into controle_leite_historico (id, vaca_id, parto_id, litros, data_controle, created_at)
    select id, vaca_id, parto_id, litros, data_controle, created_at
    from controle_leite where parto_id = v_parto_anterior.id;

    delete from controle_leite where parto_id = v_parto_anterior.id;

    -- todas as coberturas daquela lactação, exceto a que acabou de virar
    -- cobertura_id do parto novo (essa continua "viva", referenciada por um parto ativo)
    insert into coberturas_historico (id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at)
    select id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at
    from coberturas
    where vaca_id = p_vaca_id
      and data_cobertura >= v_parto_anterior.data_parto
      and data_cobertura < p_data_parto
      and id is distinct from v_cobertura_id;

    delete from coberturas
    where vaca_id = p_vaca_id
      and data_cobertura >= v_parto_anterior.data_parto
      and data_cobertura < p_data_parto
      and id is distinct from v_cobertura_id;

    -- o bezerro nascido daquela lactação continua existindo (mãe e data de
    -- nascimento já identificam a origem dele); só perde a referência direta
    -- ao parto, que agora só existe em partos_historico.
    update bezerros set parto_id = null where parto_id = v_parto_anterior.id;

    insert into partos_historico (id, vaca_id, cobertura_id, data_parto, producao_total, projecao_305, persistencia, dias_em_aberto, iep, created_at)
    select id, vaca_id, cobertura_id, data_parto, producao_total, projecao_305, persistencia, dias_em_aberto, iep, created_at
    from partos where id = v_parto_anterior.id;

    delete from partos where id = v_parto_anterior.id;
  end if;

  -- número do bezerro: mesmo espaço compartilhado de vacas/bezerros (ver 0005_bezerros.sql)
  if p_numero_bezerro is null then
    select coalesce(greatest(
      (select max(numero_identificacao) from vacas where propriedade_id = v_propriedade_id),
      (select max(numero_identificacao) from bezerros where propriedade_id = v_propriedade_id)
    ), 0) + 1 into v_numero_bezerro;
  else
    v_numero_bezerro := p_numero_bezerro;
    if exists (
      select 1 from vacas
      where propriedade_id = v_propriedade_id and numero_identificacao = v_numero_bezerro
    ) or exists (
      select 1 from bezerros
      where propriedade_id = v_propriedade_id and numero_identificacao = v_numero_bezerro
    ) then
      raise exception 'já existe um animal com o número %', v_numero_bezerro;
    end if;
  end if;

  insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento, touro_id, dose_programa)
  values (v_propriedade_id, v_novo_parto.id, p_vaca_id, v_numero_bezerro, p_sexo_bezerro, p_data_parto, v_touro_id, coalesce(v_dose_programa, false));

  return v_novo_parto;
end;
$$;

-- ============================================================
-- indicadores reprodutivos do programa
-- ============================================================

-- Uma linha por fazenda que já usou dose do programa ou teve bezerro dele.
--   - taxa de concepção = inseminações positivas ÷ inseminações já diagnosticadas (pos + neg);
--     as pendentes ficam fora pra taxa não cair só porque o toque ainda não foi feito
--   - doses por prenhez = doses usadas ÷ prenhezes confirmadas
--   - gestações em curso = positivas ainda sem parto (parto previsto = cobertura + 283 dias)
create view indicadores_reprodutivos_programa with (security_invoker = true) as
with ins as (
  select v.propriedade_id, c.id, c.vaca_id, c.data_cobertura, c.diagnostico_prenhez,
         exists (select 1 from partos p where p.cobertura_id = c.id)
         or exists (select 1 from partos_historico ph where ph.cobertura_id = c.id) as pariu
  from coberturas c join vacas v on v.id = c.vaca_id
  where c.dose_programa
  union all
  select v.propriedade_id, h.id, h.vaca_id, h.data_cobertura, h.diagnostico_prenhez,
         exists (select 1 from partos_historico ph where ph.cobertura_id = h.id) as pariu
  from coberturas_historico h join vacas v on v.id = h.vaca_id
  where h.dose_programa
),
por_fazenda as (
  select
    propriedade_id,
    count(*)::integer as doses_usadas,
    count(distinct vaca_id)::integer as matrizes_inseminadas,
    count(*) filter (where diagnostico_prenhez = 'positivo')::integer as prenhezes,
    count(*) filter (where diagnostico_prenhez = 'negativo')::integer as negativos,
    count(*) filter (where diagnostico_prenhez = 'pendente' or diagnostico_prenhez is null)::integer as pendentes,
    count(distinct vaca_id) filter (where diagnostico_prenhez = 'positivo')::integer as matrizes_prenhes,
    count(*) filter (where diagnostico_prenhez = 'positivo' and not pariu)::integer as gestacoes_em_curso,
    min(data_cobertura + 283) filter (where diagnostico_prenhez = 'positivo' and not pariu) as proximo_parto_previsto
  from ins
  group by propriedade_id
),
nascidos as (
  select
    propriedade_id,
    count(*)::integer as nascimentos,
    count(*) filter (where sexo = 'femea')::integer as femeas,
    count(*) filter (where sexo = 'macho')::integer as machos,
    count(*) filter (where sexo = 'natimorto')::integer as natimortos,
    count(*) filter (where sexo = 'femea' and vaca_id_gerada is not null)::integer as femeas_no_rebanho
  from bezerros
  where dose_programa
  group by propriedade_id
)
select
  coalesce(f.propriedade_id, n.propriedade_id) as propriedade_id,
  coalesce(f.doses_usadas, 0) as doses_usadas,
  coalesce(f.matrizes_inseminadas, 0) as matrizes_inseminadas,
  coalesce(f.prenhezes, 0) as prenhezes,
  coalesce(f.negativos, 0) as negativos,
  coalesce(f.pendentes, 0) as pendentes,
  coalesce(f.matrizes_prenhes, 0) as matrizes_prenhes,
  case when coalesce(f.prenhezes, 0) + coalesce(f.negativos, 0) > 0
    then round(f.prenhezes * 100.0 / (f.prenhezes + f.negativos), 1) end as taxa_concepcao,
  case when coalesce(f.prenhezes, 0) > 0
    then round(f.doses_usadas::numeric / f.prenhezes, 2) end as doses_por_prenhez,
  coalesce(f.gestacoes_em_curso, 0) as gestacoes_em_curso,
  f.proximo_parto_previsto,
  coalesce(n.nascimentos, 0) as nascimentos,
  coalesce(n.femeas, 0) as femeas,
  coalesce(n.machos, 0) as machos,
  coalesce(n.natimortos, 0) as natimortos,
  coalesce(n.femeas_no_rebanho, 0) as femeas_no_rebanho
from por_fazenda f
full join nascidos n on n.propriedade_id = f.propriedade_id;
