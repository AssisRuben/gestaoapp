-- Diagnóstico de prenhez só na cobertura ATUAL da vaca (achado em 15/10/2026, Fazenda Teste):
-- "vaca 10 positivo" pelo WhatsApp gravou positivo numa cobertura de 19/10/2025 e respondeu "parto
-- previsto para 29/07/2026" — data que já passou. O bot (0025) e o Lançar no campo (0035) pegavam a
-- cobertura mais recente da vaca SEM olhar se ela é da lactação atual ou se a gestação já terminou.
--
-- Regra única agora (_diagnosticar_cobertura_atual), a mesma de "aguardando diagnóstico" e do status
-- reprodutivo: a cobertura da view coberturas_atuais (0038) — a mais recente depois do parto ativo,
-- que ainda não virou parto. Sem ela, recusa e pede a cobertura. Positivo com o parto previsto já no
-- passado também é recusado: ou a vaca pariu (falta o parto) ou foi coberta de novo (falta a cobertura).

create or replace function _diagnosticar_cobertura_atual(
  p_vaca_id uuid,
  p_resultado text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_cobertura coberturas_atuais;
  v_ultima date;
  v_parto date;
  v_previsto date;
  v_msg text;
begin
  select numero_identificacao into v_numero from vacas where id = p_vaca_id;

  if p_resultado is null or p_resultado not in ('positivo', 'negativo', 'pendente') then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o resultado do diagnóstico. Diga se a vaca está prenhe (positivo) ou vazia (negativo).');
  end if;

  select * into v_cobertura from coberturas_atuais where vaca_id = p_vaca_id;

  if v_cobertura.id is null then
    select max(data_cobertura) into v_ultima from coberturas where vaca_id = p_vaca_id;
    select max(data_parto) into v_parto from partos where vaca_id = p_vaca_id and ativa;
    if v_ultima is null then
      v_msg := format('A vaca %s não tem cobertura registrada. Registre a cobertura (data e touro) antes do diagnóstico.', v_numero);
    else
      v_msg := format('A vaca %s não tem cobertura depois do último parto%s (a última cobertura é de %s e já resultou em parto). '
        || 'Registre a cobertura nova (data e touro) antes do diagnóstico.',
        v_numero, coalesce(' (' || _fmt_data(v_parto) || ')', ''), _fmt_data(v_ultima));
    end if;
    return jsonb_build_object('ok', false, 'mensagem', v_msg);
  end if;

  v_previsto := v_cobertura.data_cobertura + 283;
  if p_resultado = 'positivo' and v_previsto < _hoje_fazenda() then
    return jsonb_build_object('ok', false, 'mensagem',
      format('A última cobertura da vaca %s é de %s — o parto dela já teria sido em %s. '
        || 'Se a vaca pariu, registre o parto; se foi coberta de novo, registre a cobertura nova e depois o diagnóstico.',
        v_numero, _fmt_data(v_cobertura.data_cobertura), _fmt_data(v_previsto)));
  end if;

  update coberturas set diagnostico_prenhez = p_resultado where id = v_cobertura.id;

  v_msg := format('Diagnóstico da vaca %s (cobertura de %s) registrado como %s.',
    v_numero, _fmt_data(v_cobertura.data_cobertura), p_resultado);
  if p_resultado = 'positivo' then
    v_msg := v_msg || format(' Parto previsto para %s; secar a partir de %s.',
      _fmt_data(v_previsto), _fmt_data(v_previsto - 60));
  elsif p_resultado = 'negativo' then
    v_msg := v_msg || ' A vaca volta pra lista de vazias.';
  end if;

  return jsonb_build_object('ok', true, 'mensagem', v_msg);
end;
$$;

revoke execute on function _diagnosticar_cobertura_atual(uuid, text) from public, anon, authenticated;

-- ============================================================
-- Bot (0025): mesma assinatura, agora pela regra única
-- ============================================================

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
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_vaca_id uuid;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  select id into v_vaca_id from vacas
  where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_vaca;
  if v_vaca_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', coalesce(p_numero_vaca::text, '(sem número)')));
  end if;

  return _diagnosticar_cobertura_atual(v_vaca_id, _texto_comparavel(p_resultado));
end;
$$;

-- ============================================================
-- Lançar no campo (0035): igual, só o ramo do diagnóstico mudou
-- ============================================================

create or replace function registrar_lancamento_campo(
  p_id uuid,
  p_propriedade_id uuid,
  p_tipo text,
  p_dados jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ja lancamentos_campo;
  v_vaca vacas;
  v_cobertura coberturas;
  v_parto partos;
  v_bezerro bezerros;
  v_resultado jsonb;
  v_data date;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  -- reenvio do mesmo lançamento: devolve o que já foi feito
  select * into v_ja from lancamentos_campo where id = p_id;
  if v_ja.id is not null then
    return v_ja.resultado || jsonb_build_object('repetido', true);
  end if;

  select * into v_vaca from vacas
  where id = nullif(p_dados->>'vaca_id', '')::uuid and propriedade_id = p_propriedade_id;

  begin
    if v_vaca.id is null then
      v_resultado := jsonb_build_object('ok', false, 'mensagem', 'Vaca não encontrada nesta fazenda.');

    elsif p_tipo = 'cobertura' then
      v_data := (p_dados->>'data')::date;
      if v_data is null or v_data > _hoje_fazenda() then
        raise exception 'data da cobertura inválida';
      end if;
      v_cobertura := _registrar_cobertura(
        v_vaca.id, v_data,
        nullif(trim(coalesce(p_dados->>'touro_texto', '')), ''),
        nullif(p_dados->>'touro_id', '')::uuid,
        coalesce((p_dados->>'dose_programa')::boolean, false));
      v_resultado := jsonb_build_object('ok', true, 'mensagem',
        format('Cobertura da vaca %s em %s registrada%s.', v_vaca.numero_identificacao, _fmt_data(v_data),
          case when v_cobertura.dose_programa then ' (dose do programa)' else '' end));

    elsif p_tipo = 'parto' then
      v_data := (p_dados->>'data')::date;
      if v_data is null or v_data > _hoje_fazenda() then
        raise exception 'data do parto inválida';
      end if;
      v_parto := _registrar_parto(
        v_vaca.id, v_data,
        nullif(p_dados->>'numero_bezerro', '')::integer,
        nullif(p_dados->>'sexo_bezerro', ''));
      select * into v_bezerro from bezerros where parto_id = v_parto.id limit 1;
      v_resultado := jsonb_build_object('ok', true, 'mensagem',
        format('Parto da vaca %s em %s registrado — cria nº %s.', v_vaca.numero_identificacao, _fmt_data(v_data),
          coalesce(v_bezerro.numero_identificacao::text, '?')));

    elsif p_tipo = 'diagnostico' then
      v_resultado := _diagnosticar_cobertura_atual(v_vaca.id, p_dados->>'resultado');

    else
      v_resultado := jsonb_build_object('ok', false, 'mensagem', 'Tipo de lançamento inválido.');
    end if;
  exception when others then
    v_resultado := jsonb_build_object('ok', false, 'mensagem',
      format('Vaca %s: %s.', coalesce(v_vaca.numero_identificacao::text, '?'), sqlerrm));
  end;

  -- recusa também fica registrada: reenviar devolve a mesma recusa, não tenta de novo às cegas
  insert into lancamentos_campo (id, propriedade_id, tipo, dados, resultado, enviado_por)
  values (p_id, p_propriedade_id, p_tipo, p_dados, v_resultado, auth.uid());

  return v_resultado;
end;
$$;
