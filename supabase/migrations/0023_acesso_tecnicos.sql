-- Acesso de técnicos (veterinário/zootecnista) a mais de uma fazenda.
--
-- A tabela de vínculo já existe desde 0001 (usuarios_propriedades, papel 'produtor' | 'tecnico'),
-- e toda RPC/policy confere só "existe vínculo com essa propriedade" — então um técnico vinculado
-- já lê e escreve tudo da fazenda, e o seletor de fazenda do site já lista as várias. Faltava
-- como CRIAR o vínculo: até aqui só por insert manual no banco.
--
-- Quem pode dar/tirar acesso de técnico a uma fazenda:
--   - o produtor da fazenda (papel 'produtor' nela) — o dono decide quem vê os dados;
--   - o gestor — fazenda que só usa o bot de WhatsApp não tem produtor com conta no site.
-- O técnico em si não concede acesso a ninguém. O vínculo de produtor nunca é removido por aqui.
--
-- O técnico precisa ter conta antes (cadastro "Sou técnico" no login, ou entrar com Google); o
-- vínculo é feito pelo e-mail dessa conta. auth.users não é legível pelo cliente, por isso
-- tudo aqui é security definer.

create or replace function _pode_gerenciar_acessos(p_propriedade_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from gestores where usuario_id = auth.uid())
      or exists (
        select 1 from usuarios_propriedades
        where usuario_id = auth.uid()
          and propriedade_id = p_propriedade_id
          and papel = 'produtor'
      );
$$;

revoke execute on function _pode_gerenciar_acessos(uuid) from public, anon, authenticated;

create or replace function _nome_usuario(p_meta jsonb) returns text
language sql
immutable
as $$
  select nullif(trim(coalesce(
    p_meta->>'nome',
    p_meta->>'full_name',
    p_meta->>'name',
    p_meta->>'nome_produtor'
  )), '');
$$;

-- Quem tem acesso a uma fazenda. Visível pra qualquer um com vínculo nela e pro gestor.
create or replace function listar_acessos_propriedade(p_propriedade_id uuid)
returns table (usuario_id uuid, email text, nome text, papel text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not (
    _pode_gerenciar_acessos(p_propriedade_id)
    or exists (
      select 1 from usuarios_propriedades up
      where up.usuario_id = auth.uid() and up.propriedade_id = p_propriedade_id
    )
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  return query
    select up.usuario_id, u.email::text, _nome_usuario(u.raw_user_meta_data), up.papel, up.created_at
    from usuarios_propriedades up
    join auth.users u on u.id = up.usuario_id
    where up.propriedade_id = p_propriedade_id
    order by (up.papel = 'produtor') desc, up.created_at;
end;
$$;

create or replace function vincular_tecnico(p_propriedade_id uuid, p_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_papel_atual text;
begin
  if not _pode_gerenciar_acessos(p_propriedade_id) then
    raise exception 'Só o produtor da fazenda ou o gestor pode dar acesso a técnicos.';
  end if;

  if not exists (select 1 from propriedades where id = p_propriedade_id) then
    raise exception 'Fazenda não encontrada.';
  end if;

  select id into v_usuario_id
  from auth.users
  where lower(email) = lower(trim(p_email));

  if v_usuario_id is null then
    raise exception 'Não existe conta com o e-mail %. Peça pro técnico se cadastrar no site (opção "Sou técnico") e tente de novo.', trim(p_email);
  end if;

  if exists (select 1 from gestores where usuario_id = v_usuario_id) then
    raise exception 'Essa conta é de gestor e já enxerga todas as fazendas.';
  end if;

  select papel into v_papel_atual
  from usuarios_propriedades
  where usuario_id = v_usuario_id and propriedade_id = p_propriedade_id;

  if v_papel_atual is not null then
    raise exception 'Essa conta já tem acesso a esta fazenda (como %).', v_papel_atual;
  end if;

  insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
  values (v_usuario_id, p_propriedade_id, 'tecnico');
end;
$$;

create or replace function desvincular_tecnico(p_propriedade_id uuid, p_usuario_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not _pode_gerenciar_acessos(p_propriedade_id) then
    raise exception 'Só o produtor da fazenda ou o gestor pode remover acesso de técnicos.';
  end if;

  delete from usuarios_propriedades
  where usuario_id = p_usuario_id
    and propriedade_id = p_propriedade_id
    and papel = 'tecnico';

  if not found then
    raise exception 'Esse técnico não tem acesso a esta fazenda.';
  end if;
end;
$$;

-- Painel do gestor: todos os vínculos de todas as fazendas numa chamada só.
create or replace function acessos_todas_fazendas()
returns table (propriedade_id uuid, usuario_id uuid, email text, nome text, papel text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from gestores where gestores.usuario_id = auth.uid()) then
    raise exception 'Só o gestor pode ver os acessos de todas as fazendas.';
  end if;

  return query
    select up.propriedade_id, up.usuario_id, u.email::text, _nome_usuario(u.raw_user_meta_data),
           up.papel, up.created_at
    from usuarios_propriedades up
    join auth.users u on u.id = up.usuario_id
    order by up.propriedade_id, (up.papel = 'produtor') desc, up.created_at;
end;
$$;

revoke execute on function listar_acessos_propriedade(uuid) from public, anon;
revoke execute on function vincular_tecnico(uuid, text) from public, anon;
revoke execute on function desvincular_tecnico(uuid, uuid) from public, anon;
revoke execute on function acessos_todas_fazendas() from public, anon;
grant execute on function listar_acessos_propriedade(uuid) to authenticated;
grant execute on function vincular_tecnico(uuid, text) to authenticated;
grant execute on function desvincular_tecnico(uuid, uuid) to authenticated;
grant execute on function acessos_todas_fazendas() to authenticated;
