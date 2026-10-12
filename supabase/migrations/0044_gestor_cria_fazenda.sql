-- Entrada dos produtores (preparação de 11/10/2026, ~40 fazendas):
--
-- 1. gestor_criar_fazenda: o gestor cadastra a fazenda e o WhatsApp do produtor numa tacada — o
--    produtor já usa o bot na hora, sem conta no site. Antes isso só era possível por SQL.
-- 2. vincular_produtor / desvincular_produtor: a conta do site de quem já usa o bot é ligada à
--    fazenda que JÁ EXISTE, como produtor, pelo e-mail (decisão: o gestor libera — ninguém entra na
--    fazenda de outro só digitando o número). Antes, o produtor que criava conta com "Sou produtor"
--    ganhava uma segunda fazenda vazia. O cadastro do site agora tem "minha fazenda já usa o
--    WhatsApp", que cria a conta sem fazenda (igual à do técnico).
--    Quem libera: gestor ou produtor da fazenda (_pode_gerenciar_acessos, 0023). Quem remove: só o
--    gestor (correção de engano) — produtor não tira outro produtor.

create or replace function gestor_criar_fazenda(
  p_nome_propriedade text,
  p_nome_produtor text,
  p_municipio text default null,
  p_estado text default null,
  p_tecnico_responsavel text default null,
  p_whatsapp text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor do programa pode cadastrar fazendas.';
  end if;
  if nullif(trim(p_nome_propriedade), '') is null then
    raise exception 'Informe o nome da fazenda.';
  end if;
  if nullif(trim(p_nome_produtor), '') is null then
    raise exception 'Informe o nome do produtor.';
  end if;
  if exists (select 1 from propriedades where lower(trim(nome_propriedade)) = lower(trim(p_nome_propriedade))
             and lower(coalesce(trim(municipio), '')) = lower(coalesce(trim(p_municipio), ''))) then
    raise exception 'Já existe a fazenda "%" nesse município.', trim(p_nome_propriedade);
  end if;

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel)
  values (trim(p_nome_propriedade), trim(p_nome_produtor), nullif(trim(p_municipio), ''),
          nullif(upper(trim(p_estado)), ''), nullif(trim(p_tecnico_responsavel), ''))
  returning id into v_id;

  -- o trigger de 0024 normaliza o número e recusa formato inválido ou número já usado — o erro
  -- desfaz a fazenda junto (mesma transação)
  if nullif(trim(p_whatsapp), '') is not null then
    insert into usuarios_whatsapp (propriedade_id, telefone) values (v_id, trim(p_whatsapp));
  end if;

  return v_id;
end;
$$;

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
    raise exception 'Não existe conta com o e-mail %. Peça pro produtor criar a conta no site (Cadastre-se → Sou produtor → "minha fazenda já usa o WhatsApp") e tente de novo.', trim(p_email);
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

create or replace function desvincular_produtor(p_propriedade_id uuid, p_usuario_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor do programa pode remover o acesso de um produtor.';
  end if;

  delete from usuarios_propriedades
  where usuario_id = p_usuario_id and propriedade_id = p_propriedade_id and papel = 'produtor';

  if not found then
    raise exception 'Essa conta não é produtor desta fazenda.';
  end if;
end;
$$;

revoke execute on function gestor_criar_fazenda(text, text, text, text, text, text) from public, anon;
revoke execute on function vincular_produtor(uuid, text) from public, anon;
revoke execute on function desvincular_produtor(uuid, uuid) from public, anon;
grant execute on function gestor_criar_fazenda(text, text, text, text, text, text) to authenticated;
grant execute on function vincular_produtor(uuid, text) to authenticated;
grant execute on function desvincular_produtor(uuid, uuid) to authenticated;
