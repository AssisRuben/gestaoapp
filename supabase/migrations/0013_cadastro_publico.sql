-- Cadastro público: quando alguém se cadastra pela tela de login informando dados de uma
-- propriedade nova (nome_propriedade, nome_produtor, etc. em raw_user_meta_data), este trigger
-- cria a propriedade, vincula o novo usuário a ela (papel='produtor') e, se veio um whatsapp,
-- cria o registro em usuarios_whatsapp. Tudo isso roda ANTES da confirmação de e-mail (não tem
-- sessão ainda nesse momento), por isso precisa ser um trigger em auth.users com
-- SECURITY DEFINER, não uma chamada normal via RLS/RPC feita pelo cliente.
--
-- Se o cadastro não vier com metadata de propriedade (ex.: um convite futuro pra um usuário
-- entrar numa propriedade já existente), o trigger não faz nada — fica restrito ao fluxo de
-- "cadastrar fazenda nova" da tela de login.

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

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel)
  values (v_nome_propriedade, v_nome_produtor, v_municipio, v_estado, v_tecnico_responsavel)
  returning id into v_propriedade_id;

  insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
  values (new.id, v_propriedade_id, 'produtor');

  if v_whatsapp is not null and v_whatsapp <> '' then
    insert into usuarios_whatsapp (propriedade_id, telefone)
    values (v_propriedade_id, v_whatsapp);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_signup on auth.users;

create trigger on_auth_user_created_signup
  after insert on auth.users
  for each row execute function public.handle_new_user_signup();
