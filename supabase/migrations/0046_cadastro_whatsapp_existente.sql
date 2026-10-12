-- Cadastro "Sou produtor" com WhatsApp que JÁ é de uma fazenda (11/10/2026).
--
-- O produtor entra no Gestão Pec pelo gestor (cadastro da fazenda + WhatsApp, 0044) e só depois
-- talvez crie conta no site. Antes, o "Sou produtor" criava uma segunda fazenda vazia; a 0044 pôs
-- no cadastro uma caixinha "minha fazenda já usa o WhatsApp", que não fazia sentido pro produtor.
-- Agora o próprio cadastro percebe: se o WhatsApp informado já pertence a uma fazenda, não cria
-- outra — a conta fica sem fazenda, e o site (tela "Falta liberar seu acesso") explica que o gestor
-- vai ligar a conta. Não liga sozinho: bastaria digitar o número de outra pessoa.

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

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel)
  values (v_nome_propriedade, v_nome_produtor, v_municipio, v_estado, v_tecnico_responsavel)
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

-- mensagem de 0044 citava a caixinha que saiu do cadastro
create or replace function vincular_produtor(p_propriedade_id uuid, p_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
  v_papel_atual text;
begin
  if not _pode_gerenciar_acessos(p_propriedade_id) then
    raise exception 'Só o produtor da fazenda ou o gestor pode liberar acesso de produtor.';
  end if;

  if not exists (select 1 from propriedades where id = p_propriedade_id) then
    raise exception 'Fazenda não encontrada.';
  end if;

  select id into v_usuario_id from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario_id is null then
    raise exception 'Não existe conta com o e-mail %. Peça pro produtor criar a conta no site (Cadastre-se → Sou produtor, com o WhatsApp da fazenda) e tente de novo.', trim(p_email);
  end if;

  select papel into v_papel_atual
  from usuarios_propriedades where usuario_id = v_usuario_id and propriedade_id = p_propriedade_id;

  if v_papel_atual = 'produtor' then
    raise exception 'Essa conta já é produtor desta fazenda.';
  elsif v_papel_atual is not null then
    update usuarios_propriedades set papel = 'produtor'
    where usuario_id = v_usuario_id and propriedade_id = p_propriedade_id;
  else
    insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
    values (v_usuario_id, p_propriedade_id, 'produtor');
  end if;
end;
$$;
