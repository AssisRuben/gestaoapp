-- Técnico que cadastra fazendas de acompanhamento (12/11/2026).
--
-- Contexto: o gestor acompanha produtores que não são clientes pagantes. Eles não devem ter acesso
-- (nem conta no site, nem bot): a fazenda é cadastrada SEM WhatsApp e operada por um técnico.
-- Antes, só o gestor criava fazenda sem produtor (gestor_criar_fazenda, 0044), e o gestor vê todas as
-- fazendas — não serve pra um técnico que só pode ver as que ele mesmo cadastrou.
--
-- 1. propriedades.plano: 'pagante' (padrão — tudo que já existe) ou 'acompanhamento' (cadastrada por
--    técnico, sem acesso do produtor). Serve pra filtrar painéis e planilhas do gestor.
-- 2. tecnicos_cadastradores: quem o GESTOR autoriza a criar fazendas (não é qualquer conta que se diz
--    técnico no cadastro — o metadata do Auth é editável pelo próprio usuário).
-- 3. tecnico_criar_fazenda / tecnico_criar_fazendas (lote, 'validar' ou 'importar'): cria a fazenda
--    sem WhatsApp e já liga quem criou, como técnico (papel 'tecnico', 0023).

alter table propriedades add column if not exists plano text not null default 'pagante';
alter table propriedades drop constraint if exists propriedades_plano_check;
alter table propriedades add constraint propriedades_plano_check check (plano in ('pagante', 'acompanhamento'));

create table if not exists tecnicos_cadastradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- sem policy: ninguém lê/escreve direto, só pelas funções abaixo (security definer)
alter table tecnicos_cadastradores enable row level security;

create or replace function _pode_cadastrar_fazendas() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from tecnicos_cadastradores where usuario_id = auth.uid());
$$;

revoke execute on function _pode_cadastrar_fazendas() from public, anon, authenticated;

-- o site pergunta isso pra decidir se mostra "Cadastrar fazendas"
create or replace function posso_cadastrar_fazendas() returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select _pode_cadastrar_fazendas();
$$;

create or replace function listar_tecnicos_cadastradores()
returns table (usuario_id uuid, email text, nome text, desde timestamptz, fazendas bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor pode ver quem cadastra fazendas.';
  end if;
  return query
    select t.usuario_id, u.email::text, _nome_usuario(u.raw_user_meta_data), t.created_at,
           (select count(*) from usuarios_propriedades up
            join propriedades p on p.id = up.propriedade_id
            where up.usuario_id = t.usuario_id and up.papel = 'tecnico' and p.plano = 'acompanhamento')
    from tecnicos_cadastradores t join auth.users u on u.id = t.usuario_id
    order by t.created_at;
end;
$$;

create or replace function adicionar_tecnico_cadastrador(p_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usuario_id uuid;
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor pode autorizar quem cadastra fazendas.';
  end if;

  select id into v_usuario_id from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario_id is null then
    raise exception 'Não existe conta com o e-mail %. Peça pra pessoa se cadastrar no site (Cadastre-se → Sou técnico) e tente de novo.', trim(p_email);
  end if;

  if exists (select 1 from tecnicos_cadastradores where usuario_id = v_usuario_id) then
    raise exception 'Essa conta já pode cadastrar fazendas.';
  end if;

  insert into tecnicos_cadastradores (usuario_id) values (v_usuario_id);
end;
$$;

-- tirar a autorização NÃO apaga as fazendas já cadastradas nem o acesso dele a elas (isso é por fazenda,
-- em Acessos)
create or replace function remover_tecnico_cadastrador(p_usuario_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor pode tirar a autorização de cadastrar fazendas.';
  end if;

  delete from tecnicos_cadastradores where usuario_id = p_usuario_id;
  if not found then
    raise exception 'Essa conta não está autorizada a cadastrar fazendas.';
  end if;
end;
$$;

-- regra única (a função de lote chama esta): cria a fazenda de acompanhamento e liga quem criou
create or replace function _criar_fazenda_acompanhamento(
  p_usuario_id uuid,
  p_nome_propriedade text,
  p_nome_produtor text,
  p_municipio text,
  p_estado text,
  p_tecnico_responsavel text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
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

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel, plano)
  values (trim(p_nome_propriedade), trim(p_nome_produtor), nullif(trim(p_municipio), ''),
          nullif(upper(trim(p_estado)), ''), nullif(trim(p_tecnico_responsavel), ''), 'acompanhamento')
  returning id into v_id;

  insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
  values (p_usuario_id, v_id, 'tecnico');

  return v_id;
end;
$$;

revoke execute on function _criar_fazenda_acompanhamento(uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function tecnico_criar_fazenda(
  p_nome_propriedade text,
  p_nome_produtor text,
  p_municipio text default null,
  p_estado text default null,
  p_tecnico_responsavel text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not _pode_cadastrar_fazendas() then
    raise exception 'Sua conta não está autorizada a cadastrar fazendas. Peça ao gestor do programa.';
  end if;
  return _criar_fazenda_acompanhamento(auth.uid(), p_nome_propriedade, p_nome_produtor,
                                       p_municipio, p_estado, p_tecnico_responsavel);
end;
$$;

-- Lote (planilha). p_linhas: [{linha, nome_propriedade, nome_produtor, municipio, estado,
-- tecnico_responsavel, erro?}]. p_gravar=false só confere (nada fica gravado). Cada linha num bloco
-- próprio: uma com erro não derruba as outras (o site decide se importa só as certas). Nome repetido
-- DENTRO da própria planilha também é recusado (a 2ª vez já bate com a 1ª).
create or replace function tecnico_criar_fazendas(p_linhas jsonb, p_gravar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_resultados jsonb := '[]'::jsonb;
  v_ok integer := 0;
  v_erros integer := 0;
begin
  if not _pode_cadastrar_fazendas() then
    raise exception 'Sua conta não está autorizada a cadastrar fazendas. Peça ao gestor do programa.';
  end if;
  if jsonb_typeof(p_linhas) is distinct from 'array' then
    raise exception 'planilha inválida';
  end if;
  if jsonb_array_length(p_linhas) > 500 then
    raise exception 'No máximo 500 fazendas por vez.';
  end if;

  begin
    for r in select * from jsonb_array_elements(p_linhas) loop
      begin
        if r->>'erro' is not null then raise exception '%', r->>'erro'; end if;
        perform _criar_fazenda_acompanhamento(auth.uid(), r->>'nome_propriedade', r->>'nome_produtor',
                                              r->>'municipio', r->>'estado', r->>'tecnico_responsavel');
        v_ok := v_ok + 1;
        v_resultados := v_resultados || jsonb_build_object('linha', r->'linha', 'ok', true);
      exception when others then
        v_erros := v_erros + 1;
        v_resultados := v_resultados || jsonb_build_object('linha', r->'linha', 'ok', false, 'erro', sqlerrm);
      end;
    end loop;

    -- só conferir: desfaz tudo (a variável v_resultados não é desfeita)
    if not p_gravar then
      raise exception using errcode = 'P0099', message = 'desfazer';
    end if;
  exception when sqlstate 'P0099' then
    null;
  end;

  return jsonb_build_object('gravado', p_gravar, 'ok', v_ok, 'erros', v_erros, 'linhas', v_resultados);
end;
$$;

revoke execute on function posso_cadastrar_fazendas() from public, anon;
revoke execute on function listar_tecnicos_cadastradores() from public, anon;
revoke execute on function adicionar_tecnico_cadastrador(text) from public, anon;
revoke execute on function remover_tecnico_cadastrador(uuid) from public, anon;
revoke execute on function tecnico_criar_fazenda(text, text, text, text, text) from public, anon;
revoke execute on function tecnico_criar_fazendas(jsonb, boolean) from public, anon;
grant execute on function posso_cadastrar_fazendas() to authenticated;
grant execute on function listar_tecnicos_cadastradores() to authenticated;
grant execute on function adicionar_tecnico_cadastrador(text) to authenticated;
grant execute on function remover_tecnico_cadastrador(uuid) to authenticated;
grant execute on function tecnico_criar_fazenda(text, text, text, text, text) to authenticated;
grant execute on function tecnico_criar_fazendas(jsonb, boolean) to authenticated;
