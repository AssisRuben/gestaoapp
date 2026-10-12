-- O produtor entra no Gestão Pec se cadastrando no site — é o cadastro que libera o WhatsApp dele
-- pro bot (decisão de 12/10/2026). Quem entra com Google (ou criou conta como técnico) não passa
-- pelo formulário "Sou produtor" e ficava sem como criar a fazenda. criar_minha_fazenda faz o mesmo
-- que o cadastro: fazenda + vínculo de produtor + WhatsApp. WhatsApp que já é de outra fazenda é
-- recusado (a fazenda já existe; o gestor libera o acesso — 0044/0046).

create or replace function criar_minha_fazenda(
  p_nome_propriedade text,
  p_nome_produtor text,
  p_whatsapp text,
  p_municipio text default null,
  p_estado text default null,
  p_tecnico_responsavel text default null
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

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel)
  values (trim(p_nome_propriedade), trim(p_nome_produtor), nullif(trim(p_municipio), ''),
          nullif(upper(trim(p_estado)), ''), nullif(trim(p_tecnico_responsavel), ''))
  returning id into v_id;

  insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
  values (auth.uid(), v_id, 'produtor');

  -- trigger de 0024 normaliza e recusa formato inválido (desfaz tudo junto)
  insert into usuarios_whatsapp (propriedade_id, telefone) values (v_id, trim(p_whatsapp));

  return v_id;
end;
$$;

revoke execute on function criar_minha_fazenda(text, text, text, text, text, text) from public, anon;
grant execute on function criar_minha_fazenda(text, text, text, text, text, text) to authenticated;
