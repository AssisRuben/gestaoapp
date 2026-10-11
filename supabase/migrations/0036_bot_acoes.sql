-- WhatsApp com o que antes só dava pelo site:
--   - consultar o saldo de doses do programa (relatório tipo 'doses' em bot_consultar);
--   - "recebi as doses" (confirma as entregas pendentes), "parar/voltar os lembretes",
--     "a bezerra 105 virou vaca" — todas pela intenção "outras_acoes" → bot_acao.
-- Mesmas regras do site: confirmar_recebimento_doses (0018), lembretes (0031), promover_bezerro (0029).

-- ============================================================
-- Bezerra vira vaca: regra única (site e bot)
-- ============================================================

create or replace function _promover_bezerro(p_bezerro_id uuid) returns vacas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bezerro bezerros;
  v_numero integer;
  v_vaca vacas;
begin
  select * into v_bezerro from bezerros where id = p_bezerro_id;
  if v_bezerro.id is null then
    raise exception 'bezerro não encontrado';
  end if;
  if v_bezerro.vaca_id_gerada is not null then
    raise exception 'esse animal já foi cadastrado como vaca';
  end if;
  if v_bezerro.sexo in ('macho', 'natimorto') then
    raise exception 'só bezerras viram vaca no cadastro';
  end if;

  v_numero := v_bezerro.numero_identificacao;
  if v_numero is null then
    select coalesce(greatest(
      (select max(numero_identificacao) from vacas where propriedade_id = v_bezerro.propriedade_id),
      (select max(numero_identificacao) from bezerros where propriedade_id = v_bezerro.propriedade_id)
    ), 0) + 1 into v_numero;
  elsif exists (
    select 1 from vacas where propriedade_id = v_bezerro.propriedade_id and numero_identificacao = v_numero
  ) then
    raise exception 'já existe uma vaca com o número % — mude o número do bezerro antes', v_numero;
  end if;

  insert into vacas (propriedade_id, mae_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (v_bezerro.propriedade_id, v_bezerro.mae_id, v_numero, 'novilha', 'vazia')
  returning * into v_vaca;

  update bezerros set vaca_id_gerada = v_vaca.id, numero_identificacao = v_numero where id = p_bezerro_id;
  return v_vaca;
end;
$$;

revoke execute on function _promover_bezerro(uuid) from public, anon, authenticated;

create or replace function promover_bezerro(p_bezerro_id uuid) returns vacas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
begin
  select propriedade_id into v_propriedade_id from bezerros where id = p_bezerro_id;
  if v_propriedade_id is null then
    raise exception 'bezerro não encontrado';
  end if;
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;
  return _promover_bezerro(p_bezerro_id);
end;
$$;

-- ============================================================
-- Relatório de doses do programa
-- ============================================================

create or replace function _rel_doses(p_propriedade_id uuid, p_audio boolean) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_saldo text;
  v_total integer;
  v_pendentes text;
  v_tem_programa boolean;
begin
  select exists (select 1 from entregas_doses where propriedade_id = p_propriedade_id) into v_tem_programa;
  if not v_tem_programa then
    return 'Sua fazenda ainda não recebeu doses do programa de sêmen.';
  end if;

  select string_agg(
           format('- %s: %s %s no saldo (recebidas %s, usadas %s%s)', t.nome, s.saldo,
             case when s.saldo = 1 then 'dose' else 'doses' end, s.recebidas, s.utilizadas,
             case when s.baixas > 0 then format(', perdidas %s', s.baixas) else '' end),
           chr(10) order by s.saldo desc, t.nome),
         coalesce(sum(s.saldo), 0)
  into v_saldo, v_total
  from saldo_doses s join touros t on t.id = s.touro_id
  where s.propriedade_id = p_propriedade_id and (s.recebidas > 0 or s.saldo > 0);

  select string_agg(format('- %s doses do touro %s (entregues em %s)', e.quantidade, t.nome, _fmt_data(e.data_entrega)),
           chr(10) order by e.data_entrega)
  into v_pendentes
  from entregas_doses e join touros t on t.id = e.touro_id
  where e.propriedade_id = p_propriedade_id and e.recebido_em is null;

  if p_audio then
    return format('Você tem %s doses do programa no saldo.', v_total)
      || case when v_pendentes is not null then ' Há doses entregues esperando você confirmar o recebimento.' else '' end;
  end if;

  return format('*Doses do programa* — %s no saldo', v_total) || chr(10)
    || coalesce(v_saldo, 'Nenhuma dose recebida ainda.')
    || case when v_pendentes is not null then
         chr(10) || chr(10) || 'Aguardando você confirmar o recebimento:' || chr(10) || v_pendentes
         || chr(10) || 'Quando chegar, responda "recebi as doses".'
       else '' end;
end;
$$;

revoke execute on function _rel_doses(uuid, boolean) from public, anon, authenticated;

-- bot_consultar de 0027 + o relatório de doses (tipo_relatorio 'doses')
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
    select id into v_vaca_id from vacas
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

-- ============================================================
-- Outras ações pelo WhatsApp
-- ============================================================

create or replace function bot_acao(p_telefone text, p_acao text, p_entidades jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_acao text := lower(coalesce(p_acao, ''));
  v_alvo text := _texto_comparavel(p_entidades->>'touro_semen');
  v_lista text;
  v_qtd integer;
  v_numero integer;
  v_bezerro bezerros;
  v_vaca vacas;
  v_mae integer;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if v_acao = 'confirmar_doses' then
    -- confirma as entregas pendentes (só as do touro falado, se ele disse qual)
    with confirmadas as (
      update entregas_doses e set recebido_em = now(), recebido_por = null
      from touros t
      where t.id = e.touro_id and e.propriedade_id = v_propriedade_id and e.recebido_em is null
        and (v_alvo = '' or _texto_comparavel(t.nome) = v_alvo or _texto_comparavel(t.codigo) = v_alvo)
      returning e.quantidade, t.nome, e.data_entrega
    )
    select string_agg(format('%s doses do touro %s (entregues em %s)', quantidade, nome, _fmt_data(data_entrega)), '; '), count(*)
    into v_lista, v_qtd
    from confirmadas;

    if v_qtd = 0 then
      return jsonb_build_object('ok', false, 'mensagem',
        case when v_alvo <> '' then 'Não achei entrega desse touro esperando confirmação. Pergunte "quantas doses eu tenho" pra ver as pendentes.'
             else 'Não há entrega de doses esperando confirmação.' end);
    end if;
    return jsonb_build_object('ok', true, 'mensagem',
      format('Recebimento confirmado: %s. As doses já entram no saldo.', v_lista));

  elsif v_acao in ('ligar_lembretes', 'desligar_lembretes') then
    update propriedades set lembretes_whatsapp = (v_acao = 'ligar_lembretes') where id = v_propriedade_id;
    return jsonb_build_object('ok', true, 'mensagem',
      case when v_acao = 'ligar_lembretes'
        then 'Lembretes ligados: às 6h, nos dias com pendência (secar, diagnóstico, parto, leite), eu te aviso aqui.'
        else 'Lembretes desligados. Pra voltar, é só mandar "ligar lembretes".' end);

  elsif v_acao = 'promover_bezerro' then
    v_numero := nullif(regexp_replace(coalesce(p_entidades->>'numero_bezerro', p_entidades->>'numero_vaca', ''), '\D', '', 'g'), '')::integer;
    if v_numero is null then
      return jsonb_build_object('ok', false, 'mensagem', 'Me diga o número da bezerra, por exemplo: "a bezerra 105 virou vaca".');
    end if;
    select * into v_bezerro from bezerros
    where propriedade_id = v_propriedade_id and numero_identificacao = v_numero
    order by (vaca_id_gerada is null) desc, created_at desc
    limit 1;
    if v_bezerro.id is null then
      return jsonb_build_object('ok', false, 'mensagem', format('Não achei a bezerra %s no cadastro.', v_numero));
    end if;
    begin
      v_vaca := _promover_bezerro(v_bezerro.id);
    exception when others then
      return jsonb_build_object('ok', false, 'mensagem', format('Não cadastrei a bezerra %s como vaca: %s.', v_numero, sqlerrm));
    end;
    select numero_identificacao into v_mae from vacas where id = v_vaca.mae_id;
    return jsonb_build_object('ok', true, 'mensagem',
      format('Bezerra %s cadastrada como vaca (novilha)%s.', v_vaca.numero_identificacao,
        coalesce(format(' — filha da vaca %s', v_mae), '')));

  else
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o que fazer. Posso confirmar doses recebidas, ligar ou desligar os lembretes e cadastrar uma bezerra como vaca.');
  end if;
end;
$$;

revoke execute on function bot_acao(text, text, jsonb) from public, anon, authenticated;
grant execute on function bot_acao(text, text, jsonb) to service_role;
