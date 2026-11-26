-- WhatsApp: as respostas de registro também mostram o nome da vaca.
--
-- "a Mimosa produziu 10 litros" → "Registrado 10 L da vaca 12 · Mimosa em 26/11/2026."
-- A 0062 fez isso só na consulta (bot_consultar). Aqui vale pra leite (registrar, corrigir,
-- excluir), cobertura, parto, diagnóstico, cadastro e atualização de vaca. O nome aparece sempre
-- que a vaca tem nome — tanto faz se o produtor falou o nome ou o número.
--
-- Como: as funções antigas foram renomeadas pra _bot_<nome>_sem_nome (a regra continua lá, sem
-- mudança) e bot_<nome> virou um invólucro com os mesmos parâmetros que passa a resposta por
-- _bot_nome_das_vacas. O n8n continua chamando os mesmos endereços.
-- MUDAR A REGRA de uma dessas funções = mudar a _bot_<nome>_sem_nome. Um "create or replace
-- function bot_<nome>" copiado de migration antiga apaga o nome das respostas.

-- Troca "vaca 12" / "Vaca 12" por "vaca 12 · Mimosa" quando a vaca 12 da fazenda tem nome.
-- Só o número inteiro (a vaca 1 não pega a 12) e nunca duas vezes.
create or replace function _bot_nome_das_vacas(p_propriedade_id uuid, p_texto text) returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_texto text := p_texto;
  r record;
begin
  if p_propriedade_id is null or p_texto is null then
    return p_texto;
  end if;

  for r in
    select distinct v.numero_identificacao as numero, trim(v.nome) as nome
    from regexp_matches(p_texto, '[Vv]aca (\d{1,9})\M', 'g') as m(g)
    join vacas v on v.propriedade_id = p_propriedade_id and v.numero_identificacao = m.g[1]::integer
    where nullif(trim(v.nome), '') is not null
  loop
    v_texto := regexp_replace(v_texto, '([Vv]aca) ' || r.numero || '\M(?! ·)',
      '\1 ' || r.numero || ' · ' || replace(r.nome, '\', '\\'), 'g');
  end loop;
  return v_texto;
end;
$$;

revoke execute on function _bot_nome_das_vacas(uuid, text) from public, anon, authenticated;

-- Aplica nos campos de texto da resposta do bot.
create or replace function _bot_resposta_com_nome(p_telefone text, p_resposta jsonb) returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_resposta jsonb := p_resposta;
  v_campo text;
begin
  if v_propriedade_id is null or p_resposta is null then
    return p_resposta;
  end if;
  foreach v_campo in array array['mensagem', 'descricao'] loop
    if jsonb_typeof(v_resposta->v_campo) = 'string' then
      v_resposta := v_resposta || jsonb_build_object(v_campo,
        _bot_nome_das_vacas(v_propriedade_id, v_resposta->>v_campo));
    end if;
  end loop;
  return v_resposta;
end;
$$;

revoke execute on function _bot_resposta_com_nome(text, jsonb) from public, anon, authenticated;

-- ============================================================
-- Funções antigas → _sem_nome
-- ============================================================

alter function bot_registrar_leite(text, integer, numeric, date, text) rename to _bot_registrar_leite_sem_nome;
alter function bot_corrigir_leite(text, integer, date, text, numeric) rename to _bot_corrigir_leite_sem_nome;
alter function bot_localizar_leite_exclusao(text, integer, date, text) rename to _bot_localizar_leite_exclusao_sem_nome;
alter function bot_excluir_leite(text, uuid) rename to _bot_excluir_leite_sem_nome;
alter function bot_registrar_cobertura(text, integer, date, text) rename to _bot_registrar_cobertura_sem_nome;
alter function bot_registrar_parto(text, integer, date, integer, text) rename to _bot_registrar_parto_sem_nome;
alter function bot_diagnosticar_prenhez(text, integer, text) rename to _bot_diagnosticar_prenhez_sem_nome;
alter function bot_cadastrar_vaca(text, integer, integer, text, text, text) rename to _bot_cadastrar_vaca_sem_nome;
alter function bot_atualizar_vaca(text, integer, text, text) rename to _bot_atualizar_vaca_sem_nome;

-- ============================================================
-- Invólucros com os nomes que o n8n chama
-- ============================================================

create or replace function bot_registrar_leite(
  p_telefone text,
  p_numero_vaca integer,
  p_litros numeric,
  p_data date default null,
  p_periodo text default null
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select _bot_resposta_com_nome(p_telefone,
    _bot_registrar_leite_sem_nome(p_telefone, p_numero_vaca, p_litros, p_data, p_periodo));
$$;

create or replace function bot_corrigir_leite(
  p_telefone text,
  p_numero_vaca integer,
  p_data date,
  p_periodo text,
  p_litros numeric
) returns jsonb
language sql
security definer
set search_path = public
as $$
  select _bot_resposta_com_nome(p_telefone,
    _bot_corrigir_leite_sem_nome(p_telefone, p_numero_vaca, p_data, p_periodo, p_litros));
$$;

create or replace function bot_localizar_leite_exclusao(
  p_telefone text,
  p_numero_vaca integer,
  p_data date,
  p_periodo text
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select _bot_resposta_com_nome(p_telefone,
    _bot_localizar_leite_exclusao_sem_nome(p_telefone, p_numero_vaca, p_data, p_periodo));
$$;

create or replace function bot_excluir_leite(p_telefone text, p_registro_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  -- a função apaga o registro, mas a vaca continua: o nome é achado depois
  v_resposta := _bot_excluir_leite_sem_nome(p_telefone, p_registro_id);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;

create or replace function bot_registrar_cobertura(
  p_telefone text,
  p_numero_vaca integer,
  p_data_cobertura date,
  p_touro_texto text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  v_resposta := _bot_registrar_cobertura_sem_nome(p_telefone, p_numero_vaca, p_data_cobertura, p_touro_texto);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;

create or replace function bot_registrar_parto(
  p_telefone text,
  p_numero_vaca integer,
  p_data_parto date,
  p_numero_bezerro integer default null,
  p_sexo_bezerro text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  v_resposta := _bot_registrar_parto_sem_nome(p_telefone, p_numero_vaca, p_data_parto, p_numero_bezerro, p_sexo_bezerro);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;

create or replace function bot_diagnosticar_prenhez(
  p_telefone text,
  p_numero_vaca integer,
  p_resultado text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  v_resposta := _bot_diagnosticar_prenhez_sem_nome(p_telefone, p_numero_vaca, p_resultado);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;

create or replace function bot_cadastrar_vaca(
  p_telefone text,
  p_numero_vaca integer,
  p_numero_mae integer,
  p_origem text,
  p_status_produtivo text,
  p_status_reprodutivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  -- a vaca nova não tem nome pelo WhatsApp; quem ganha o nome aqui é a mãe ("Filha da vaca 3 · Mimosa")
  v_resposta := _bot_cadastrar_vaca_sem_nome(p_telefone, p_numero_vaca, p_numero_mae, p_origem,
    p_status_produtivo, p_status_reprodutivo);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;

create or replace function bot_atualizar_vaca(
  p_telefone text,
  p_numero_vaca integer,
  p_status_produtivo text,
  p_status_reprodutivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  v_resposta := _bot_atualizar_vaca_sem_nome(p_telefone, p_numero_vaca, p_status_produtivo, p_status_reprodutivo);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;

-- Só a service role (o n8n) chama, como antes. As _sem_nome mantêm as permissões que já tinham.
do $$
declare
  v_assinatura text;
begin
  foreach v_assinatura in array array[
    'bot_registrar_leite(text, integer, numeric, date, text)',
    'bot_corrigir_leite(text, integer, date, text, numeric)',
    'bot_localizar_leite_exclusao(text, integer, date, text)',
    'bot_excluir_leite(text, uuid)',
    'bot_registrar_cobertura(text, integer, date, text)',
    'bot_registrar_parto(text, integer, date, integer, text)',
    'bot_diagnosticar_prenhez(text, integer, text)',
    'bot_cadastrar_vaca(text, integer, integer, text, text, text)',
    'bot_atualizar_vaca(text, integer, text, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_assinatura);
    execute format('grant execute on function %s to service_role', v_assinatura);
  end loop;
end $$;
