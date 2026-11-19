-- Técnico libera o acesso do produtor pelo e-mail (19/11/2026).
--
-- Antes só o gestor ou o próprio produtor ligava uma conta como produtor da fazenda, e a conta
-- precisava existir. Produtor que só usa o WhatsApp ficava esperando o gestor. Agora, no modal da
-- fazenda → Acessos, quem tem vínculo com a fazenda (produtor ou técnico) ou o gestor digita o
-- e-mail do produtor: se não houver conta, o site cria (já confirmada, com a service role) e manda
-- o e-mail "Criar nova senha"; depois liga a conta como produtor por vincular_produtor.
--
-- O técnico continua sem dar acesso de TÉCNICO (vincular_tecnico) e sem remover ninguém; remover
-- produtor segue só com o gestor (desvincular_produtor).

create or replace function _pode_liberar_produtor(p_propriedade_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _pode_gerenciar_acessos(p_propriedade_id)
      or exists (
        select 1 from usuarios_propriedades
        where usuario_id = auth.uid()
          and propriedade_id = p_propriedade_id
          and papel = 'tecnico'
      );
$$;

revoke execute on function _pode_liberar_produtor(uuid) from public, anon, authenticated;

-- O site confere ANTES de criar a conta (a criação é pela service role, que não sabe quem pediu).
create or replace function pode_liberar_produtor(p_propriedade_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _pode_liberar_produtor(p_propriedade_id);
$$;

revoke execute on function pode_liberar_produtor(uuid) from public, anon;
grant execute on function pode_liberar_produtor(uuid) to authenticated;

create or replace function vincular_produtor(p_propriedade_id uuid, p_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_papel_atual text;
begin
  if not _pode_liberar_produtor(p_propriedade_id) then
    raise exception 'Só o produtor, o técnico da fazenda ou o gestor pode liberar acesso de produtor.';
  end if;

  if not exists (select 1 from propriedades where id = p_propriedade_id) then
    raise exception 'Fazenda não encontrada.';
  end if;

  select id into v_usuario_id from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario_id is null then
    raise exception 'Não existe conta com o e-mail %.', trim(p_email);
  end if;

  select papel into v_papel_atual
  from usuarios_propriedades where usuario_id = v_usuario_id and propriedade_id = p_propriedade_id;

  if v_papel_atual = 'produtor' then
    raise exception 'Essa conta já é produtor desta fazenda.';
  elsif v_papel_atual is not null then
    -- era técnico desta fazenda: passa a produtor
    update usuarios_propriedades set papel = 'produtor'
    where usuario_id = v_usuario_id and propriedade_id = p_propriedade_id;
  else
    insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
    values (v_usuario_id, p_propriedade_id, 'produtor');
  end if;
end;
$$;
