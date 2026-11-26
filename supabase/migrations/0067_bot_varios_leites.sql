-- WhatsApp: o leite de várias vacas na mesma mensagem (texto ou áudio).
--
-- "vaca 12 deu 10 litros, a 15 deu 12 e a Mimosa 8" → a IA devolve entidades.leites (uma linha por
-- vaca) e o n8n chama esta função em vez de bot_registrar_leite. Antes só uma vaca era gravada e
-- as outras se perdiam sem aviso — inclusive quando o produtor mandava mensagens separadas em
-- sequência, que o buffer do bot junta numa só.
--
-- Cada vaca: número OU nome (mesma comparação de bot_resolver_vacas), mesma regra do leite
-- (_registrar_leite) e um bloco próprio — o que der certo fica gravado, o que der errado volta na
-- lista com o motivo, sem travar as outras (igual à Pesagem do dia). Data e ordenha faladas uma
-- vez valem pra todas; a ordenha de um item vale mais que a geral. Teto de 40 vacas por mensagem.

create or replace function bot_registrar_leites(
  p_telefone text,
  p_itens jsonb,
  p_data date default null,
  p_periodo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c_maximo constant integer := 40;
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_data date := coalesce(p_data, _hoje_fazenda());
  v_periodo_geral text := _periodo_valido(p_periodo);
  v_item jsonb;
  v_numero_txt text;
  v_nome text;
  v_litros_txt text;
  v_litros numeric;
  v_periodo text;
  v_numeros integer[];
  v_vaca vacas;
  v_registro controle_leite;
  v_rotulo text;
  v_ok text[] := '{}';
  v_erros text[] := '{}';
  v_total numeric := 0;
  v_msg text;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) = 0 then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi de quais vacas é o leite. Mande, por exemplo: "vaca 12 deu 10 litros, vaca 15 deu 12".');
  end if;

  if jsonb_array_length(p_itens) > c_maximo then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Recebi %s vacas numa mensagem só. Mande no máximo %s por vez (divida em partes) ou use a Pesagem do dia no site.',
        jsonb_array_length(p_itens), c_maximo));
  end if;

  for v_item in select value from jsonb_array_elements(p_itens) loop
    v_vaca := null;
    v_numero_txt := nullif(regexp_replace(coalesce(v_item->>'numero_vaca', ''), '\D', '', 'g'), '');
    v_nome := nullif(trim(coalesce(v_item->>'nome_vaca', '')), '');
    if v_numero_txt is null and v_nome ~ '^\d{1,9}$' then
      v_numero_txt := v_nome;
    end if;

    -- 1. qual vaca
    if v_numero_txt is not null then
      v_rotulo := 'vaca ' || ltrim(v_numero_txt, '0');
      if length(v_numero_txt) <= 9 then
        select * into v_vaca from vacas
        where propriedade_id = v_propriedade_id and numero_identificacao = v_numero_txt::integer;
      end if;
      if v_vaca.id is null then
        v_erros := v_erros || (v_rotulo || ': não está no cadastro');
        continue;
      end if;
      v_rotulo := 'vaca ' || v_vaca.numero_identificacao;
    elsif v_nome is not null then
      v_rotulo := '"' || v_nome || '"';
      select array_agg(numero_identificacao order by numero_identificacao) into v_numeros
      from vacas
      where propriedade_id = v_propriedade_id and _nome_chave(nome) = _nome_chave(v_nome);
      if v_numeros is null then
        v_erros := v_erros || (v_rotulo || ': não achei vaca com esse nome — mande o número');
        continue;
      elsif array_length(v_numeros, 1) > 1 then
        v_erros := v_erros || format('%s: tem mais de uma vaca com esse nome (números %s) — mande o número',
          v_rotulo, array_to_string(v_numeros, ', '));
        continue;
      end if;
      select * into v_vaca from vacas
      where propriedade_id = v_propriedade_id and numero_identificacao = v_numeros[1];
      v_rotulo := 'vaca ' || v_vaca.numero_identificacao;
    else
      v_erros := v_erros || 'um lançamento sem o número da vaca';
      continue;
    end if;

    -- 2. quantos litros ("10", 10, "10,5")
    v_litros_txt := replace(trim(coalesce(v_item->>'litros', '')), ',', '.');
    if v_litros_txt !~ '^\d{1,4}(\.\d+)?$' then
      v_erros := v_erros || (v_rotulo || ': não entendi quantos litros');
      continue;
    end if;
    v_litros := v_litros_txt::numeric;

    -- 3. grava com a regra de sempre; erro numa vaca não desfaz as outras
    v_periodo := coalesce(_periodo_valido(v_item->>'periodo'), v_periodo_geral);
    begin
      v_registro := _registrar_leite(v_vaca.id, v_litros, v_data, v_periodo);
    exception when others then
      v_erros := v_erros || (v_rotulo || ': ' || sqlerrm);
      continue;
    end;

    v_total := v_total + v_registro.litros;
    v_ok := v_ok || format('• %s — %s L%s', v_rotulo, _fmt_num(v_registro.litros),
      case when v_registro.periodo is distinct from v_periodo_geral
        then coalesce(' (' || _rotulo_periodo(v_registro.periodo) || ')', '') else '' end);
  end loop;

  if cardinality(v_ok) = 0 then
    v_msg := 'Não registrei nenhum lançamento de leite:' || chr(10)
      || '• ' || array_to_string(v_erros, chr(10) || '• ');
    return jsonb_build_object('ok', false, 'mensagem', _bot_nome_das_vacas(v_propriedade_id, v_msg));
  end if;

  v_msg := case when cardinality(v_erros) = 0
      then format('Registrado o leite de %s vacas em %s', cardinality(v_ok), _fmt_data(v_data))
      else format('Registrei %s de %s lançamentos de leite em %s', cardinality(v_ok),
        cardinality(v_ok) + cardinality(v_erros), _fmt_data(v_data))
    end
    || coalesce(' (' || _rotulo_periodo(v_periodo_geral) || ')', '') || ':' || chr(10)
    || array_to_string(v_ok, chr(10)) || chr(10)
    || format('Total: %s L.', _fmt_num(v_total));

  if cardinality(v_erros) > 0 then
    v_msg := v_msg || chr(10) || chr(10) || 'Não registrei:' || chr(10)
      || '• ' || array_to_string(v_erros, chr(10) || '• ');
  end if;

  return jsonb_build_object('ok', true, 'mensagem', _bot_nome_das_vacas(v_propriedade_id, v_msg),
    'registrados', cardinality(v_ok), 'recusados', cardinality(v_erros));
end;
$$;

revoke execute on function bot_registrar_leites(text, jsonb, date, text) from public, anon, authenticated;
grant execute on function bot_registrar_leites(text, jsonb, date, text) to service_role;
