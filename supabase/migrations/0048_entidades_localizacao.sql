-- 12/10/2026:
-- 1. Doses do programa chegam às fazendas POR UMA ENTIDADE (associação, cooperativa, sindicato…).
--    Cada entrega passa a ter as duas informações: a fazenda beneficiada (como antes) e a entidade
--    por onde ela recebe, com responsável e telefone, mais a quantidade de kits. A entidade é um
--    cadastro próprio, reaproveitado nas entregas (o gestor digita o nome e ela é achada ou criada).
-- 2. Localização da fazenda marcada pelo celular no cadastro do site ("Usar minha localização"):
--    o cadastro grava latitude/longitude (já existiam desde 0017, usadas no mapa do gestor).

-- ============================================================
-- 1. Entidades e entregas
-- ============================================================

create table if not exists entidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  responsavel text,
  telefone text,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_entidades_nome on entidades (lower(trim(nome)));

alter table entidades enable row level security;

alter table entregas_doses add column if not exists entidade_id uuid references entidades(id);
alter table entregas_doses add column if not exists kits integer check (kits is null or kits > 0);

-- quem tem entrega vê a entidade por onde recebeu; o gestor vê todas. Escrita só por função.
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
  );

-- O gestor digita o nome da entidade: acha pelo nome (sem diferença de maiúscula/espaço) ou cria.
-- Responsável/telefone informados atualizam o cadastro.
create or replace function gestor_salvar_entidade(p_nome text, p_responsavel text default null, p_telefone text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor do programa pode cadastrar entidades.';
  end if;
  if nullif(trim(p_nome), '') is null then
    raise exception 'Informe a entidade beneficiada.';
  end if;

  select id into v_id from entidades where lower(trim(nome)) = lower(trim(p_nome));
  if v_id is null then
    insert into entidades (nome, responsavel, telefone)
    values (trim(p_nome), nullif(trim(p_responsavel), ''), nullif(trim(p_telefone), ''))
    returning id into v_id;
  else
    update entidades set
      responsavel = coalesce(nullif(trim(p_responsavel), ''), responsavel),
      telefone = coalesce(nullif(trim(p_telefone), ''), telefone)
    where id = v_id;
  end if;
  return v_id;
end;
$$;

revoke execute on function gestor_salvar_entidade(text, text, text) from public, anon;
grant execute on function gestor_salvar_entidade(text, text, text) to authenticated;

-- ============================================================
-- 2. Localização no cadastro
-- ============================================================

create or replace function _coordenada(p_valor text, p_limite numeric) returns numeric
language plpgsql
immutable
as $$
declare
  v numeric;
begin
  if p_valor is null or trim(p_valor) = '' then return null; end if;
  v := trim(p_valor)::numeric;
  return case when abs(v) <= p_limite then v end;
exception when others then
  return null;
end;
$$;

-- cadastro "Sou produtor" (0046) + latitude/longitude do metadata
create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_nome_propriedade text := new.raw_user_meta_data->>'nome_propriedade';
  v_nome_produtor text := new.raw_user_meta_data->>'nome_produtor';
  v_municipio text := new.raw_user_meta_data->>'municipio';
  v_estado text := new.raw_user_meta_data->>'estado';
  v_tecnico_responsavel text := new.raw_user_meta_data->>'tecnico_responsavel';
  v_whatsapp text := new.raw_user_meta_data->>'whatsapp';
begin
  if v_nome_propriedade is null or v_nome_propriedade = '' then
    return new;
  end if;

  -- WhatsApp já de uma fazenda: é o produtor dela chegando ao site — não cria fazenda nova
  if v_whatsapp is not null and v_whatsapp <> '' and exists (
    select 1 from usuarios_whatsapp
    where public._telefone_chave(telefone) = public._telefone_chave(v_whatsapp)
  ) then
    return new;
  end if;

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel, latitude, longitude)
  values (v_nome_propriedade, v_nome_produtor, v_municipio, v_estado, v_tecnico_responsavel,
          public._coordenada(new.raw_user_meta_data->>'latitude', 90),
          public._coordenada(new.raw_user_meta_data->>'longitude', 180))
  returning id into v_propriedade_id;

  insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
  values (new.id, v_propriedade_id, 'produtor');

  if v_whatsapp is not null and v_whatsapp <> '' then
    begin
      insert into usuarios_whatsapp (propriedade_id, telefone)
      values (v_propriedade_id, v_whatsapp);
    exception when others then
      raise warning 'cadastro sem WhatsApp (%): %', v_whatsapp, sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- criar_minha_fazenda (0047) + localização
drop function if exists criar_minha_fazenda(text, text, text, text, text, text);
create or replace function criar_minha_fazenda(
  p_nome_propriedade text,
  p_nome_produtor text,
  p_whatsapp text,
  p_municipio text default null,
  p_estado text default null,
  p_tecnico_responsavel text default null,
  p_latitude numeric default null,
  p_longitude numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta pra cadastrar a fazenda.';
  end if;
  if nullif(trim(p_nome_propriedade), '') is null then
    raise exception 'Informe o nome da fazenda.';
  end if;
  if nullif(trim(p_nome_produtor), '') is null then
    raise exception 'Informe o nome do produtor.';
  end if;
  if nullif(trim(p_whatsapp), '') is null then
    raise exception 'Informe o WhatsApp: é por ele que você vai usar o bot do Gestão Pec.';
  end if;
  if exists (select 1 from usuarios_whatsapp
             where public._telefone_chave(telefone) = public._telefone_chave(p_whatsapp)) then
    raise exception 'Esse WhatsApp já está cadastrado numa fazenda do Gestão Pec. Se a fazenda é sua, mande o seu e-mail pro gestor do programa liberar o acesso.';
  end if;

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel, latitude, longitude)
  values (trim(p_nome_propriedade), trim(p_nome_produtor), nullif(trim(p_municipio), ''),
          nullif(upper(trim(p_estado)), ''), nullif(trim(p_tecnico_responsavel), ''),
          case when abs(p_latitude) <= 90 then p_latitude end,
          case when abs(p_longitude) <= 180 then p_longitude end)
  returning id into v_id;

  insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
  values (auth.uid(), v_id, 'produtor');

  insert into usuarios_whatsapp (propriedade_id, telefone) values (v_id, trim(p_whatsapp));

  return v_id;
end;
$$;

revoke execute on function criar_minha_fazenda(text, text, text, text, text, text, numeric, numeric) from public, anon;
grant execute on function criar_minha_fazenda(text, text, text, text, text, text, numeric, numeric) to authenticated;
