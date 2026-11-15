-- WhatsApp: a resposta sobre uma vaca mostra o nome dela ("Vaca 1 · Mimosa — reprodução").
--
-- bot_consultar de 0036, com uma mudança: quando a consulta é de uma vaca que tem nome, o texto
-- pronto troca "Vaca 1"/"vaca 1" por "Vaca 1 · Mimosa". Os relatórios (_rel_vaca_*) não mudam.

create or replace function bot_consultar(
  p_telefone text,
  p_intencao text,
  p_entidades jsonb,
  p_mensagem text,
  p_audio boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_tipo text := lower(coalesce(p_entidades->>'tipo_relatorio', ''));
  v_numero_txt text := regexp_replace(coalesce(p_entidades->>'numero_vaca', ''), '\D', '', 'g');
  v_numero integer := case when v_numero_txt <> '' then v_numero_txt::integer end;
  v_periodo_dias integer := case when coalesce(p_entidades->>'periodo_dias', '') ~ '^\d+$' then (p_entidades->>'periodo_dias')::integer end;
  v_audio boolean := coalesce(p_audio, false);
  v_vaca_id uuid;
  v_nome text;
  v_texto text;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if p_intencao = 'consultar_financeiro' then
    v_texto := _rel_financeiro(v_propriedade_id, p_mensagem, v_periodo_dias, p_entidades->>'tipo_financeiro', v_audio);
  elsif v_tipo = 'doses' then
    v_texto := _rel_doses(v_propriedade_id, v_audio);
  elsif v_tipo = 'cadastro' then
    v_texto := _rel_cadastro(v_propriedade_id, v_audio);
  elsif v_numero is not null then
    select id, nullif(trim(nome), '') into v_vaca_id, v_nome from vacas
    where propriedade_id = v_propriedade_id and numero_identificacao = v_numero;
    if v_vaca_id is null then
      return jsonb_build_object('ok', false, 'mensagem',
        format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', v_numero));
    end if;
    v_texto := case
      when v_tipo = 'reprodutivo' then _rel_vaca_reproducao(v_vaca_id, v_audio)
      when v_tipo = 'leite' then _rel_vaca_leite(v_vaca_id, v_audio)
      else _rel_vaca_reproducao(v_vaca_id, v_audio) || case when v_audio then ' ' else chr(10) || chr(10) end || _rel_vaca_leite(v_vaca_id, v_audio)
    end;
    -- "Vaca 1" → "Vaca 1 · Mimosa" (só o número inteiro: a vaca 1 não pega a 12)
    if v_nome is not null then
      v_texto := regexp_replace(v_texto, '([Vv]aca) ' || v_numero || '\M',
        '\1 ' || v_numero || ' · ' || replace(v_nome, '\', '\\'), 'g');
    end if;
  elsif v_tipo = 'reprodutivo' then
    v_texto := _rel_reproducao_fazenda(v_propriedade_id, v_audio);
  elsif v_tipo = 'geral' then
    v_texto := _rel_producao(v_propriedade_id, p_mensagem, v_periodo_dias, v_audio)
      || case when v_audio then ' ' else chr(10) || chr(10) end || _rel_reproducao_fazenda(v_propriedade_id, v_audio);
  else
    v_texto := _rel_producao(v_propriedade_id, p_mensagem, v_periodo_dias, v_audio);
  end if;

  return jsonb_build_object('ok', true, 'mensagem', v_texto);
end;
$$;

revoke execute on function bot_consultar(text, text, jsonb, text, boolean) from public, anon, authenticated;
grant execute on function bot_consultar(text, text, jsonb, text, boolean) to service_role;
