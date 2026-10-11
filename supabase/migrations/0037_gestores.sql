-- Cadastro de gestores pela tela (aba Técnicos → "Gestores do programa"). Antes era insert à mão
-- no banco (0017). Só gestor vê, adiciona e remove; nunca deixa o programa sem nenhum gestor.
-- A pessoa precisa ter conta no site antes (mesmo fluxo do técnico: Cadastre-se → Sou técnico, ou
-- Google). Gestor também pode ter fazenda própria — o site deixa alternar (layout de (app)).

create or replace function _eh_gestor() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from gestores where usuario_id = auth.uid());
$$;

revoke execute on function _eh_gestor() from public, anon, authenticated;

create or replace function listar_gestores()
returns table (usuario_id uuid, email text, nome text, desde timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor pode ver os gestores do programa.';
  end if;
  return query
    select g.usuario_id, u.email::text, _nome_usuario(u.raw_user_meta_data), g.created_at
    from gestores g join auth.users u on u.id = g.usuario_id
    order by g.created_at;
end;
$$;

create or replace function adicionar_gestor(p_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor pode adicionar gestores.';
  end if;

  select id into v_usuario_id from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario_id is null then
    raise exception 'Não existe conta com o e-mail %. Peça pra pessoa se cadastrar no site e tente de novo.', trim(p_email);
  end if;

  if exists (select 1 from gestores where usuario_id = v_usuario_id) then
    raise exception 'Essa conta já é gestora do programa.';
  end if;

  insert into gestores (usuario_id) values (v_usuario_id);
end;
$$;

create or replace function remover_gestor(p_usuario_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor pode remover gestores.';
  end if;

  if (select count(*) from gestores) <= 1 then
    raise exception 'O programa precisa de pelo menos um gestor.';
  end if;

  delete from gestores where usuario_id = p_usuario_id;
  if not found then
    raise exception 'Essa conta não é gestora do programa.';
  end if;
end;
$$;

revoke execute on function listar_gestores() from public, anon;
revoke execute on function adicionar_gestor(text) from public, anon;
revoke execute on function remover_gestor(uuid) from public, anon;
grant execute on function listar_gestores() to authenticated;
grant execute on function adicionar_gestor(text) to authenticated;
grant execute on function remover_gestor(uuid) to authenticated;
