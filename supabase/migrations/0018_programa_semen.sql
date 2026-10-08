-- Programa de doação de sêmen: catálogo central de touros, entregas de doses por fazenda (com
-- confirmação de recebimento pela fazenda) e cobertura vinculada ao touro/dose do programa.
--
-- Quem faz o quê:
--   - Gestor (tabela gestores, 0017): cadastra touros e registra as entregas de doses. É a
--     ÚNICA escrita que o gestor ganha — as RPCs de escrita de dados da fazenda continuam sem
--     enxergá-lo (nenhuma delas olha pra tabela gestores).
--   - Fazenda (usuarios_propriedades): confirma o recebimento de cada entrega e gasta as doses
--     ao registrar coberturas com dose_programa = true.
--
-- Saldo de doses NÃO é um contador gravado: é sempre recebidas (entregas confirmadas) menos
-- utilizadas (coberturas com dose_programa, inclusive as já arquivadas em coberturas_historico
-- por registrar_parto — sem contar o histórico, cada parto "devolveria" doses ao saldo).
-- Excluir uma cobertura lançada por engano devolve a dose automaticamente.

-- ============================================================
-- touros (catálogo central)
-- ============================================================

create table touros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  codigo text,            -- código do touro na central (ex.: 7HO12345)
  raca text,
  central text,           -- central de inseminação / fornecedor
  pta_leite numeric,      -- PTA/PTA-leite em kg, conforme catálogo do fornecedor
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index touros_codigo_unico on touros (lower(codigo)) where codigo is not null;

alter table touros enable row level security;

create policy "usuario logado ve touros"
  on touros for select
  using (auth.uid() is not null);

create policy "gestor insere touros"
  on touros for insert
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

create policy "gestor atualiza touros"
  on touros for update
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()))
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

-- delete só funciona pra touro nunca usado (FKs abaixo bloqueiam o resto); pra tirar um touro
-- usado da lista, o gestor marca ativo = false.
create policy "gestor deleta touros"
  on touros for delete
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

-- ============================================================
-- entregas_doses
-- ============================================================

create table entregas_doses (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  touro_id uuid not null references touros(id),
  quantidade integer not null check (quantidade > 0),
  data_entrega date not null,
  observacao text,
  registrado_por uuid references auth.users(id) default auth.uid(),
  recebido_em timestamptz,  -- null = aguardando confirmação da fazenda
  recebido_por uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_entregas_doses_propriedade on entregas_doses (propriedade_id, touro_id);

alter table entregas_doses enable row level security;

create policy "fazenda e gestor veem entregas"
  on entregas_doses for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = entregas_doses.propriedade_id and up.usuario_id = auth.uid()
    )
    or exists (select 1 from gestores g where g.usuario_id = auth.uid())
  );

create policy "gestor insere entregas"
  on entregas_doses for insert
  with check (
    exists (select 1 from gestores g where g.usuario_id = auth.uid())
    and recebido_em is null
  );

-- Gestor só corrige/exclui entrega ainda não confirmada: depois de confirmada, as doses já
-- podem ter sido usadas, e mexer na quantidade deixaria o saldo negativo.
create policy "gestor atualiza entrega pendente"
  on entregas_doses for update
  using (
    exists (select 1 from gestores g where g.usuario_id = auth.uid())
    and recebido_em is null
  )
  with check (
    exists (select 1 from gestores g where g.usuario_id = auth.uid())
    and recebido_em is null
  );

create policy "gestor deleta entrega pendente"
  on entregas_doses for delete
  using (
    exists (select 1 from gestores g where g.usuario_id = auth.uid())
    and recebido_em is null
  );

-- A fazenda não tem policy de update: confirma o recebimento só por esta função, que mexe
-- apenas nos campos de recebimento (uma policy de update liberaria alterar a quantidade).
create or replace function confirmar_recebimento_doses(p_entrega_id uuid) returns entregas_doses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega entregas_doses;
begin
  select * into v_entrega from entregas_doses where id = p_entrega_id for update;

  if v_entrega.id is null then
    raise exception 'entrega não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_entrega.propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if v_entrega.recebido_em is not null then
    raise exception 'essa entrega já foi confirmada';
  end if;

  update entregas_doses set recebido_em = now(), recebido_por = auth.uid()
  where id = p_entrega_id
  returning * into v_entrega;

  return v_entrega;
end;
$$;

-- ============================================================
-- coberturas / bezerros: vínculo com touro e dose do programa
-- ============================================================

alter table coberturas add column touro_id uuid references touros(id);
alter table coberturas add column dose_programa boolean not null default false;
alter table coberturas add constraint coberturas_dose_programa_exige_touro
  check (not dose_programa or touro_id is not null);

alter table coberturas_historico add column touro_id uuid references touros(id);
alter table coberturas_historico add column dose_programa boolean not null default false;

-- Pai do bezerro, gravado no parto a partir da cobertura vinculada. Fica direto no bezerro
-- porque bezerros.parto_id é zerado quando a lactação é arquivada (ver registrar_parto), e a
-- genealogia não pode se perder junto.
alter table bezerros add column touro_id uuid references touros(id);

-- ============================================================
-- saldo de doses
-- ============================================================

-- security_invoker: cada usuário só enxerga as linhas que o RLS das tabelas de base libera
-- (a fazenda vê o próprio saldo; o site do gestor lê com service role).
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
)
select
  coalesce(e.propriedade_id, u.propriedade_id) as propriedade_id,
  coalesce(e.touro_id, u.touro_id) as touro_id,
  coalesce(e.recebidas, 0) as recebidas,
  coalesce(e.a_receber, 0) as a_receber,
  coalesce(u.utilizadas, 0) as utilizadas,
  coalesce(e.recebidas, 0) - coalesce(u.utilizadas, 0) as saldo
from entregue e
full join usado u on u.propriedade_id = e.propriedade_id and u.touro_id = e.touro_id;

-- Checagem usada por registrar_cobertura/atualizar_cobertura. Trava as entregas daquele
-- touro/fazenda antes de contar, pra dois lançamentos simultâneos não gastarem a mesma dose.
-- Uso interno: sem execute pra anon/authenticated (expõe saldo de qualquer fazenda).
create or replace function _garantir_saldo_dose(
  p_propriedade_id uuid,
  p_touro_id uuid,
  p_ignorar_cobertura_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recebidas integer;
  v_utilizadas integer;
begin
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

  if v_recebidas - v_utilizadas <= 0 then
    if exists (
      select 1 from entregas_doses
      where propriedade_id = p_propriedade_id and touro_id = p_touro_id and recebido_em is null
    ) then
      raise exception 'sem saldo de doses desse touro — confirme o recebimento da entrega pendente antes de usar';
    end if;
    raise exception 'sem saldo de doses desse touro no programa';
  end if;
end;
$$;

revoke execute on function _garantir_saldo_dose(uuid, uuid, uuid) from public, anon, authenticated;

-- ============================================================
-- registrar_cobertura / atualizar_cobertura com touro e dose
-- ============================================================

-- Assinatura muda (parâmetros novos com default): sem o drop, o Postgres criaria uma
-- sobrecarga e chamadas com só os parâmetros antigos ficariam ambíguas. Os parâmetros antigos
-- continuam na mesma posição, então chamadas existentes seguem funcionando.
drop function registrar_cobertura(uuid, date, text);
drop function atualizar_cobertura(uuid, date, text, text);

create or replace function registrar_cobertura(
  p_vaca_id uuid,
  p_data_cobertura date,
  p_touro_semen text default null,
  p_touro_id uuid default null,
  p_dose_programa boolean default false
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_touro_nome text;
  v_cobertura coberturas;
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

  if p_dose_programa and p_touro_id is null then
    raise exception 'escolha o touro da dose do programa';
  end if;

  if p_touro_id is not null then
    select nome into v_touro_nome from touros where id = p_touro_id;
    if v_touro_nome is null then
      raise exception 'touro não encontrado';
    end if;
  end if;

  if p_dose_programa then
    perform _garantir_saldo_dose(v_propriedade_id, p_touro_id);
  end if;

  -- touro_semen continua preenchido (com o nome do catálogo quando não vier texto) porque é o
  -- campo que os relatórios do bot e as telas antigas mostram.
  insert into coberturas (vaca_id, data_cobertura, touro_semen, touro_id, dose_programa)
  values (
    p_vaca_id,
    p_data_cobertura,
    coalesce(nullif(p_touro_semen, ''), v_touro_nome),
    p_touro_id,
    p_dose_programa
  )
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;

create or replace function atualizar_cobertura(
  p_cobertura_id uuid,
  p_data_cobertura date,
  p_touro_semen text default null,
  p_diagnostico_prenhez text default 'pendente',
  p_touro_id uuid default null,
  p_dose_programa boolean default false
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_atual coberturas;
  v_touro_nome text;
  v_cobertura coberturas;
begin
  select c.* into v_atual from coberturas c where c.id = p_cobertura_id;

  select propriedade_id into v_propriedade_id from vacas where id = v_atual.vaca_id;

  if v_propriedade_id is null then
    raise exception 'cobertura não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if p_diagnostico_prenhez not in ('pendente', 'positivo', 'negativo') then
    raise exception 'diagnóstico inválido: %', p_diagnostico_prenhez;
  end if;

  if p_dose_programa and p_touro_id is null then
    raise exception 'escolha o touro da dose do programa';
  end if;

  if p_touro_id is not null then
    select nome into v_touro_nome from touros where id = p_touro_id;
    if v_touro_nome is null then
      raise exception 'touro não encontrado';
    end if;
  end if;

  -- só precisa de saldo se a edição passa a consumir uma dose que antes não consumia
  -- (marcou dose do programa agora, ou trocou o touro de uma dose já marcada)
  if p_dose_programa
     and not (v_atual.dose_programa and v_atual.touro_id = p_touro_id) then
    perform _garantir_saldo_dose(v_propriedade_id, p_touro_id, p_cobertura_id);
  end if;

  -- update mira só esta cobertura por id, nunca todas as coberturas da vaca (ver regra 3)
  update coberturas set
    data_cobertura = p_data_cobertura,
    touro_semen = coalesce(nullif(p_touro_semen, ''), v_touro_nome),
    diagnostico_prenhez = p_diagnostico_prenhez,
    touro_id = p_touro_id,
    dose_programa = p_dose_programa
  where id = p_cobertura_id
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;

-- ============================================================
-- registrar_parto: arquiva touro/dose e grava o pai no bezerro
-- ============================================================

-- Igual à versão de 0016_remove_periodo_controle_leite.sql, com duas mudanças:
--   1. coberturas_historico recebe touro_id e dose_programa (sem isso a dose usada sumiria do
--      saldo e do histórico do programa ao arquivar).
--   2. bezerros.touro_id = touro da cobertura vinculada ao parto.
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

  -- cobertura confirmada mais recente dessa vaca
  select id, touro_id into v_cobertura_id, v_touro_id from coberturas
  where vaca_id = p_vaca_id and diagnostico_prenhez = 'positivo'
  order by data_cobertura desc limit 1;

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

  insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento, touro_id)
  values (v_propriedade_id, v_novo_parto.id, p_vaca_id, v_numero_bezerro, p_sexo_bezerro, p_data_parto, v_touro_id);

  return v_novo_parto;
end;
$$;
