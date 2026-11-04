-- Doses do programa com o TÉCNICO (04/11/2026): há técnicos que levam as doses e fazem a
-- inseminação em várias fazendas (1 a 10). Decisões do usuário:
--   - o gestor entrega pra fazenda (como antes) OU pra um técnico;
--   - o técnico registra a cobertura com a dose dele pelo site e pelo Lançar no campo (o WhatsApp do
--     produtor continua só com as doses da fazenda);
--   - o técnico pode passar doses dele pra uma fazenda (transferência, a fazenda confirma).
--
-- Tabelas próprias (entregas_doses_tecnico, baixas_doses_tecnico) em vez de deixar
-- entregas_doses.propriedade_id vazio: alertas, entidades, bot e relatórios continuam lendo
-- entregas_doses sem mudança. A transferência vira uma entrega normal da fazenda, com
-- origem_tecnico_id dizendo de quem veio.
--
-- A cobertura guarda de quem era a dose (coberturas.dose_tecnico_id; nulo = da fazenda). O resultado
-- (concepção, nascidos do programa) continua contando na fazenda da vaca.

-- ============================================================
-- Entregas e baixas do técnico
-- ============================================================

create table if not exists entregas_doses_tecnico (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references auth.users(id) on delete cascade,
  touro_id uuid not null references touros(id),
  quantidade integer not null check (quantidade > 0),
  kits integer check (kits is null or kits > 0),
  entidade_id uuid references entidades(id),
  data_entrega date not null,
  observacao text,
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  recebido_em timestamptz,  -- null = aguardando o técnico confirmar
  created_at timestamptz not null default now()
);

create index if not exists idx_entregas_doses_tecnico on entregas_doses_tecnico (tecnico_id, touro_id);

alter table entregas_doses_tecnico enable row level security;

drop policy if exists "tecnico e gestor veem entregas do tecnico" on entregas_doses_tecnico;
create policy "tecnico e gestor veem entregas do tecnico" on entregas_doses_tecnico for select
  using (tecnico_id = auth.uid() or exists (select 1 from gestores g where g.usuario_id = auth.uid()));

drop policy if exists "gestor insere entregas do tecnico" on entregas_doses_tecnico;
create policy "gestor insere entregas do tecnico" on entregas_doses_tecnico for insert
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()) and recebido_em is null);

-- como em entregas_doses: depois de confirmada, a entrega fica fixa (as doses podem já ter sido usadas)
drop policy if exists "gestor atualiza entrega pendente do tecnico" on entregas_doses_tecnico;
create policy "gestor atualiza entrega pendente do tecnico" on entregas_doses_tecnico for update
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()) and recebido_em is null)
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()) and recebido_em is null);

drop policy if exists "gestor deleta entrega pendente do tecnico" on entregas_doses_tecnico;
create policy "gestor deleta entrega pendente do tecnico" on entregas_doses_tecnico for delete
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()) and recebido_em is null);

create table if not exists baixas_doses_tecnico (
  id uuid primary key default gen_random_uuid(),
  tecnico_id uuid not null references auth.users(id) on delete cascade,
  touro_id uuid not null references touros(id),
  quantidade integer not null check (quantidade > 0),
  motivo text not null check (motivo in ('perda', 'descarte', 'transferencia', 'outro')),
  data_baixa date not null,
  observacao text,
  created_at timestamptz not null default now()
);

create index if not exists idx_baixas_doses_tecnico on baixas_doses_tecnico (tecnico_id, touro_id);

alter table baixas_doses_tecnico enable row level security;

drop policy if exists "tecnico e gestor veem baixas do tecnico" on baixas_doses_tecnico;
create policy "tecnico e gestor veem baixas do tecnico" on baixas_doses_tecnico for select
  using (tecnico_id = auth.uid() or exists (select 1 from gestores g where g.usuario_id = auth.uid()));

-- transferência do técnico pra fazenda: entrega normal da fazenda, com a origem
alter table entregas_doses add column if not exists origem_tecnico_id uuid references auth.users(id) on delete set null;

drop policy if exists "fazenda e gestor veem entregas" on entregas_doses;
create policy "fazenda e gestor veem entregas" on entregas_doses for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = entregas_doses.propriedade_id and up.usuario_id = auth.uid()
    )
    or origem_tecnico_id = auth.uid()
    or exists (select 1 from gestores g where g.usuario_id = auth.uid())
  );

-- ============================================================
-- De quem era a dose usada na cobertura
-- ============================================================

alter table coberturas add column if not exists dose_tecnico_id uuid references auth.users(id);
alter table coberturas_historico add column if not exists dose_tecnico_id uuid references auth.users(id);

-- registrar_parto arquiva as coberturas listando as colunas do INSERT (0022/0052): sem isto a dose do
-- técnico viraria "dose da fazenda" no histórico e voltaria pro saldo dele
create or replace function _cobertura_historico_dose_tecnico() returns trigger
language plpgsql
as $$
begin
  if new.dose_tecnico_id is null then
    select c.dose_tecnico_id into new.dose_tecnico_id from coberturas c where c.id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists dose_tecnico on coberturas_historico;
create trigger dose_tecnico before insert on coberturas_historico
  for each row execute function _cobertura_historico_dose_tecnico();

-- ============================================================
-- Saldo da fazenda: sem as doses que eram do técnico
-- ============================================================

create or replace view saldo_doses with (security_invoker = true) as
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
    select vaca_id, touro_id from coberturas where dose_programa and dose_tecnico_id is null
    union all
    select vaca_id, touro_id from coberturas_historico where dose_programa and dose_tecnico_id is null
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
  perform 1 from entregas_doses
  where propriedade_id = p_propriedade_id and touro_id = p_touro_id
  for update;

  select coalesce(sum(quantidade), 0) into v_recebidas
  from entregas_doses
  where propriedade_id = p_propriedade_id and touro_id = p_touro_id and recebido_em is not null;

  select count(*) into v_utilizadas
  from (
    select c.id, c.vaca_id from coberturas c
    where c.touro_id = p_touro_id and c.dose_programa and c.dose_tecnico_id is null
      and c.id is distinct from p_ignorar_cobertura_id
    union all
    select h.id, h.vaca_id from coberturas_historico h
    where h.touro_id = p_touro_id and h.dose_programa and h.dose_tecnico_id is null
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

-- ============================================================
-- Saldo do técnico
-- ============================================================

-- Sem security_invoker de propósito: o uso das doses fica nas coberturas das fazendas, e o técnico
-- que perdeu o acesso a uma fazenda continuaria vendo o saldo "voltar". O filtro é feito aqui:
-- cada técnico vê só o dele; o gestor (e a service role do site, sem auth.uid) veem todos.
create or replace view saldo_doses_tecnico as
with entregue as (
  select tecnico_id, touro_id,
    coalesce(sum(quantidade) filter (where recebido_em is not null), 0)::integer as recebidas,
    coalesce(sum(quantidade) filter (where recebido_em is null), 0)::integer as a_receber
  from entregas_doses_tecnico
  group by tecnico_id, touro_id
),
usado as (
  select dose_tecnico_id as tecnico_id, touro_id, count(*)::integer as utilizadas
  from (
    select dose_tecnico_id, touro_id from coberturas where dose_programa and dose_tecnico_id is not null
    union all
    select dose_tecnico_id, touro_id from coberturas_historico where dose_programa and dose_tecnico_id is not null
  ) u
  group by dose_tecnico_id, touro_id
),
baixado as (
  select tecnico_id, touro_id, sum(quantidade)::integer as baixas
  from baixas_doses_tecnico
  group by tecnico_id, touro_id
),
transferido as (
  -- sai do saldo do técnico na hora (as doses saíram da mão dele); cancelar a transferência devolve
  select origem_tecnico_id as tecnico_id, touro_id, sum(quantidade)::integer as transferidas
  from entregas_doses
  where origem_tecnico_id is not null
  group by origem_tecnico_id, touro_id
),
chaves as (
  select tecnico_id, touro_id from entregue
  union select tecnico_id, touro_id from usado
  union select tecnico_id, touro_id from baixado
  union select tecnico_id, touro_id from transferido
)
select
  k.tecnico_id,
  k.touro_id,
  coalesce(e.recebidas, 0) as recebidas,
  coalesce(e.a_receber, 0) as a_receber,
  coalesce(u.utilizadas, 0) as utilizadas,
  coalesce(b.baixas, 0) as baixas,
  coalesce(t.transferidas, 0) as transferidas,
  coalesce(e.recebidas, 0) - coalesce(u.utilizadas, 0) - coalesce(b.baixas, 0) - coalesce(t.transferidas, 0) as saldo
from chaves k
left join entregue e on e.tecnico_id = k.tecnico_id and e.touro_id = k.touro_id
left join usado u on u.tecnico_id = k.tecnico_id and u.touro_id = k.touro_id
left join baixado b on b.tecnico_id = k.tecnico_id and b.touro_id = k.touro_id
left join transferido t on t.tecnico_id = k.tecnico_id and t.touro_id = k.touro_id
where auth.uid() is null
   or k.tecnico_id = auth.uid()
   or exists (select 1 from gestores g where g.usuario_id = auth.uid());

revoke all on saldo_doses_tecnico from public, anon;
grant select on saldo_doses_tecnico to authenticated, service_role;

create or replace function _garantir_saldo_dose_tecnico(
  p_tecnico_id uuid,
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
  v_transferidas integer;
begin
  if p_tecnico_id is null then
    raise exception 'entre na sua conta de técnico pra usar as suas doses';
  end if;

  -- trava as entregas do técnico: dois lançamentos ao mesmo tempo não gastam a mesma dose
  perform 1 from entregas_doses_tecnico
  where tecnico_id = p_tecnico_id and touro_id = p_touro_id
  for update;

  select coalesce(sum(quantidade), 0) into v_recebidas
  from entregas_doses_tecnico
  where tecnico_id = p_tecnico_id and touro_id = p_touro_id and recebido_em is not null;

  select count(*) into v_utilizadas
  from (
    select c.id from coberturas c
    where c.dose_tecnico_id = p_tecnico_id and c.touro_id = p_touro_id and c.dose_programa
      and c.id is distinct from p_ignorar_cobertura_id
    union all
    select h.id from coberturas_historico h
    where h.dose_tecnico_id = p_tecnico_id and h.touro_id = p_touro_id and h.dose_programa
  ) u;

  select coalesce(sum(quantidade), 0) into v_baixas
  from baixas_doses_tecnico where tecnico_id = p_tecnico_id and touro_id = p_touro_id;

  select coalesce(sum(quantidade), 0) into v_transferidas
  from entregas_doses where origem_tecnico_id = p_tecnico_id and touro_id = p_touro_id;

  if v_recebidas - v_utilizadas - v_baixas - v_transferidas < p_doses then
    if exists (
      select 1 from entregas_doses_tecnico
      where tecnico_id = p_tecnico_id and touro_id = p_touro_id and recebido_em is null
    ) then
      raise exception 'sem saldo de doses suas desse touro — confirme o recebimento da entrega pendente antes de usar';
    end if;
    raise exception 'sem saldo de doses suas desse touro (disponível: %)',
      greatest(v_recebidas - v_utilizadas - v_baixas - v_transferidas, 0);
  end if;
end;
$$;

revoke execute on function _garantir_saldo_dose_tecnico(uuid, uuid, uuid, integer) from public, anon, authenticated;

-- ============================================================
-- Ações do técnico: confirmar, perda, transferir
-- ============================================================

create or replace function confirmar_recebimento_doses_tecnico(p_entrega_id uuid) returns entregas_doses_tecnico
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega entregas_doses_tecnico;
begin
  select * into v_entrega from entregas_doses_tecnico where id = p_entrega_id for update;
  if v_entrega.id is null then
    raise exception 'entrega não encontrada';
  end if;
  if v_entrega.tecnico_id is distinct from auth.uid() then
    raise exception 'essa entrega é de outro técnico';
  end if;
  if v_entrega.recebido_em is not null then
    raise exception 'essa entrega já foi confirmada';
  end if;

  update entregas_doses_tecnico set recebido_em = now() where id = p_entrega_id
  returning * into v_entrega;
  return v_entrega;
end;
$$;

revoke execute on function confirmar_recebimento_doses_tecnico(uuid) from public, anon;
grant execute on function confirmar_recebimento_doses_tecnico(uuid) to authenticated;

create or replace function registrar_baixa_doses_tecnico(
  p_touro_id uuid,
  p_quantidade integer,
  p_motivo text,
  p_data_baixa date,
  p_observacao text default null
) returns baixas_doses_tecnico
language plpgsql
security definer
set search_path = public
as $$
declare
  v_baixa baixas_doses_tecnico;
begin
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'a quantidade deve ser maior que zero';
  end if;
  if p_motivo not in ('perda', 'descarte', 'transferencia', 'outro') then
    raise exception 'motivo inválido: %', p_motivo;
  end if;

  perform _garantir_saldo_dose_tecnico(auth.uid(), p_touro_id, null, p_quantidade);

  insert into baixas_doses_tecnico (tecnico_id, touro_id, quantidade, motivo, data_baixa, observacao)
  values (auth.uid(), p_touro_id, p_quantidade, p_motivo, p_data_baixa, nullif(p_observacao, ''))
  returning * into v_baixa;
  return v_baixa;
end;
$$;

revoke execute on function registrar_baixa_doses_tecnico(uuid, integer, text, date, text) from public, anon;
grant execute on function registrar_baixa_doses_tecnico(uuid, integer, text, date, text) to authenticated;

create or replace function deletar_baixa_doses_tecnico(p_baixa_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from baixas_doses_tecnico where id = p_baixa_id and tecnico_id = auth.uid();
  if not found then
    raise exception 'baixa não encontrada';
  end if;
end;
$$;

revoke execute on function deletar_baixa_doses_tecnico(uuid) from public, anon;
grant execute on function deletar_baixa_doses_tecnico(uuid) to authenticated;

-- Técnico passa doses pra uma fazenda que ele atende. Sai do saldo dele na hora; a fazenda
-- confirma o recebimento como qualquer entrega (e só então entra no saldo dela).
create or replace function transferir_doses_tecnico(
  p_propriedade_id uuid,
  p_touro_id uuid,
  p_quantidade integer,
  p_observacao text default null
) returns entregas_doses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entrega entregas_doses;
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

  perform _garantir_saldo_dose_tecnico(auth.uid(), p_touro_id, null, p_quantidade);

  insert into entregas_doses (propriedade_id, touro_id, quantidade, data_entrega, observacao, registrado_por, origem_tecnico_id)
  values (p_propriedade_id, p_touro_id, p_quantidade, _hoje_fazenda(), nullif(trim(p_observacao), ''), auth.uid(), auth.uid())
  returning * into v_entrega;
  return v_entrega;
end;
$$;

revoke execute on function transferir_doses_tecnico(uuid, uuid, integer, text) from public, anon;
grant execute on function transferir_doses_tecnico(uuid, uuid, integer, text) to authenticated;

-- Enquanto a fazenda não confirmou, o técnico pode desfazer (as doses voltam pro saldo dele).
create or replace function cancelar_transferencia_doses(p_entrega_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from entregas_doses
  where id = p_entrega_id and origem_tecnico_id = auth.uid() and recebido_em is null;
  if not found then
    raise exception 'transferência não encontrada ou já confirmada pela fazenda';
  end if;
end;
$$;

revoke execute on function cancelar_transferencia_doses(uuid) from public, anon;
grant execute on function cancelar_transferencia_doses(uuid) to authenticated;

-- A fazenda confirma a transferência; quem transferiu não confirma a própria.
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

  if v_entrega.origem_tecnico_id = auth.uid() then
    raise exception 'quem recebe as doses na fazenda é que confirma a transferência';
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

-- Técnicos que podem receber doses (gestor escolhe na entrega): quem tem acesso de técnico a
-- alguma fazenda, ou já recebeu doses.
create or replace function listar_tecnicos_programa()
returns table (usuario_id uuid, email text, nome text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from gestores g where g.usuario_id = auth.uid()) then
    raise exception 'só o gestor do programa';
  end if;
  return query
    select u.id, u.email::text, _nome_usuario(u.raw_user_meta_data)
    from auth.users u
    where exists (select 1 from usuarios_propriedades up where up.usuario_id = u.id and up.papel = 'tecnico')
       or exists (select 1 from entregas_doses_tecnico e where e.tecnico_id = u.id)
    order by coalesce(_nome_usuario(u.raw_user_meta_data), u.email::text);
end;
$$;

revoke execute on function listar_tecnicos_programa() from public, anon;
grant execute on function listar_tecnicos_programa() to authenticated;

-- ============================================================
-- Cobertura com a dose do técnico
-- ============================================================

-- Igual a 0052, com p_dose_tecnico_id: preenchido = a dose sai do saldo desse técnico.
drop function if exists _registrar_cobertura(uuid, date, text, uuid, boolean);
create or replace function _registrar_cobertura(
  p_vaca_id uuid,
  p_data_cobertura date,
  p_touro_semen text,
  p_touro_id uuid,
  p_dose_programa boolean,
  p_dose_tecnico_id uuid default null
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_touro_nome text;
  v_cobertura coberturas;
  v_parto_ativo date;
  v_prenhe coberturas_atuais;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if p_data_cobertura is null then
    raise exception 'informe a data da cobertura';
  end if;
  if p_data_cobertura > _hoje_fazenda() then
    raise exception 'a data da cobertura (%) é no futuro — confira o dia e o ano', _fmt_data(p_data_cobertura);
  end if;

  select max(data_parto) into v_parto_ativo from partos where vaca_id = p_vaca_id and ativa;
  if p_data_cobertura < v_parto_ativo then
    raise exception 'a data da cobertura (%) é antes do último parto da vaca (%) — confira o dia e o ano',
      _fmt_data(p_data_cobertura), _fmt_data(v_parto_ativo);
  end if;

  select * into v_prenhe from coberturas_atuais
  where vaca_id = p_vaca_id and diagnostico_prenhez = 'positivo' and data_cobertura <= p_data_cobertura;
  if v_prenhe.id is not null then
    raise exception 'a vaca está prenhe da cobertura de % (parto previsto para %). Se ela perdeu a prenhez, registre o diagnóstico negativo antes da cobertura nova',
      _fmt_data(v_prenhe.data_cobertura), _fmt_data(v_prenhe.data_cobertura + 283);
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

  if p_dose_programa and p_dose_tecnico_id is not null then
    perform _garantir_saldo_dose_tecnico(p_dose_tecnico_id, p_touro_id);
  elsif p_dose_programa then
    perform _garantir_saldo_dose(v_propriedade_id, p_touro_id);
  end if;

  insert into coberturas (vaca_id, data_cobertura, touro_semen, touro_id, dose_programa, dose_tecnico_id)
  values (
    p_vaca_id,
    p_data_cobertura,
    coalesce(nullif(p_touro_semen, ''), v_touro_nome),
    p_touro_id,
    coalesce(p_dose_programa, false),
    case when coalesce(p_dose_programa, false) then p_dose_tecnico_id end
  )
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;

revoke execute on function _registrar_cobertura(uuid, date, text, uuid, boolean, uuid) from public, anon, authenticated;

-- Porta do site (0022) + p_dose_tecnico: a dose é de quem está registrando.
drop function if exists registrar_cobertura(uuid, date, text, uuid, boolean);
create or replace function registrar_cobertura(
  p_vaca_id uuid,
  p_data_cobertura date,
  p_touro_semen text default null,
  p_touro_id uuid default null,
  p_dose_programa boolean default false,
  p_dose_tecnico boolean default false
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
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

  return _registrar_cobertura(p_vaca_id, p_data_cobertura, p_touro_semen, p_touro_id, p_dose_programa,
    case when p_dose_tecnico then auth.uid() end);
end;
$$;

grant execute on function registrar_cobertura(uuid, date, text, uuid, boolean, boolean) to authenticated;

-- Edição (0018) + de quem é a dose. p_dose_tecnico: true = minha (técnico), false = da fazenda,
-- null = mantém como estava.
drop function if exists atualizar_cobertura(uuid, date, text, text, uuid, boolean);
create or replace function atualizar_cobertura(
  p_cobertura_id uuid,
  p_data_cobertura date,
  p_touro_semen text default null,
  p_diagnostico_prenhez text default 'pendente',
  p_touro_id uuid default null,
  p_dose_programa boolean default false,
  p_dose_tecnico boolean default null
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
  v_dono uuid;
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

  v_dono := case
    when not p_dose_programa then null
    when p_dose_tecnico is null then case when v_atual.dose_programa then v_atual.dose_tecnico_id end
    when p_dose_tecnico then auth.uid()
    else null
  end;

  -- só precisa de saldo se a edição passa a consumir uma dose que antes não consumia
  if p_dose_programa
     and not (v_atual.dose_programa and v_atual.touro_id = p_touro_id
              and v_atual.dose_tecnico_id is not distinct from v_dono) then
    if v_dono is not null then
      perform _garantir_saldo_dose_tecnico(v_dono, p_touro_id, p_cobertura_id);
    else
      perform _garantir_saldo_dose(v_propriedade_id, p_touro_id, p_cobertura_id);
    end if;
  end if;

  update coberturas set
    data_cobertura = p_data_cobertura,
    touro_semen = coalesce(nullif(p_touro_semen, ''), v_touro_nome),
    diagnostico_prenhez = p_diagnostico_prenhez,
    touro_id = p_touro_id,
    dose_programa = p_dose_programa,
    dose_tecnico_id = v_dono
  where id = p_cobertura_id
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;

grant execute on function atualizar_cobertura(uuid, date, text, text, uuid, boolean, boolean) to authenticated;

-- Lançar no campo (0051) + dose do técnico ("dose_tecnico": true no lançamento).
create or replace function registrar_lancamento_campo(
  p_id uuid,
  p_propriedade_id uuid,
  p_tipo text,
  p_dados jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ja lancamentos_campo;
  v_vaca vacas;
  v_cobertura coberturas;
  v_parto partos;
  v_bezerro bezerros;
  v_resultado jsonb;
  v_data date;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  -- reenvio do mesmo lançamento: devolve o que já foi feito
  select * into v_ja from lancamentos_campo where id = p_id;
  if v_ja.id is not null then
    return v_ja.resultado || jsonb_build_object('repetido', true);
  end if;

  select * into v_vaca from vacas
  where id = nullif(p_dados->>'vaca_id', '')::uuid and propriedade_id = p_propriedade_id;

  begin
    if v_vaca.id is null then
      v_resultado := jsonb_build_object('ok', false, 'mensagem', 'Vaca não encontrada nesta fazenda.');

    elsif p_tipo = 'cobertura' then
      v_data := (p_dados->>'data')::date;
      if v_data is null or v_data > _hoje_fazenda() then
        raise exception 'data da cobertura inválida';
      end if;
      v_cobertura := _registrar_cobertura(
        v_vaca.id, v_data,
        nullif(trim(coalesce(p_dados->>'touro_texto', '')), ''),
        nullif(p_dados->>'touro_id', '')::uuid,
        coalesce((p_dados->>'dose_programa')::boolean, false),
        case when coalesce((p_dados->>'dose_tecnico')::boolean, false) then auth.uid() end);
      v_resultado := jsonb_build_object('ok', true, 'mensagem',
        format('Cobertura da vaca %s em %s registrada%s.', v_vaca.numero_identificacao, _fmt_data(v_data),
          case when v_cobertura.dose_tecnico_id is not null then ' (dose do programa, sua)'
               when v_cobertura.dose_programa then ' (dose do programa)' else '' end));

    elsif p_tipo = 'parto' then
      v_data := (p_dados->>'data')::date;
      if v_data is null or v_data > _hoje_fazenda() then
        raise exception 'data do parto inválida';
      end if;
      v_parto := _registrar_parto(
        v_vaca.id, v_data,
        nullif(p_dados->>'numero_bezerro', '')::integer,
        nullif(p_dados->>'sexo_bezerro', ''));
      select * into v_bezerro from bezerros where parto_id = v_parto.id limit 1;
      v_resultado := jsonb_build_object('ok', true, 'mensagem',
        format('Parto da vaca %s em %s registrado — cria nº %s.', v_vaca.numero_identificacao, _fmt_data(v_data),
          coalesce(v_bezerro.numero_identificacao::text, '?')));

    elsif p_tipo = 'diagnostico' then
      v_resultado := _diagnosticar_cobertura_atual(v_vaca.id, p_dados->>'resultado');

    else
      v_resultado := jsonb_build_object('ok', false, 'mensagem', 'Tipo de lançamento inválido.');
    end if;
  exception when others then
    v_resultado := jsonb_build_object('ok', false, 'mensagem',
      format('Vaca %s: %s.', coalesce(v_vaca.numero_identificacao::text, '?'), sqlerrm));
  end;

  insert into lancamentos_campo (id, propriedade_id, tipo, dados, resultado, enviado_por)
  values (p_id, p_propriedade_id, p_tipo, p_dados, v_resultado, auth.uid());

  return v_resultado;
end;
$$;

-- ============================================================
-- Entidade das entregas do técnico: ele vê com quem retirar
-- ============================================================

drop policy if exists "entidades visiveis" on entidades;
create policy "entidades visiveis"
  on entidades for select
  using (
    exists (select 1 from gestores g where g.usuario_id = auth.uid())
    or exists (
      select 1 from entregas_doses e
      join usuarios_propriedades up on up.propriedade_id = e.propriedade_id
      where e.entidade_id = entidades.id and up.usuario_id = auth.uid()
    )
    or exists (
      select 1 from entregas_doses_tecnico et
      where et.entidade_id = entidades.id and et.tecnico_id = auth.uid()
    )
  );
