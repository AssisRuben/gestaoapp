-- Lembretes diários pelo WhatsApp SUSPENSOS (decisão de 11/10/2026): o bot roda numa instância da
-- Evolution (API não oficial), e mensagem iniciada pelo número — várias fazendas no mesmo horário —
-- arrisca o bloqueio da conta. O workflow fazenda-leite-lembretes fica despublicado, o site esconde
-- a opção e aqui o bot deixa de ligar: "liga os lembretes" responde que não está disponível.
-- Tudo o mais (coluna, lembretes_do_dia, workflow) fica pronto pra voltar com a API oficial ou por
-- e-mail.

update propriedades set lembretes_whatsapp = false where lembretes_whatsapp;

-- bot_acao de 0036, só muda o ramo dos lembretes e a mensagem de "não entendi"
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

  elsif v_acao = 'ligar_lembretes' then
    return jsonb_build_object('ok', false, 'mensagem',
      'Os lembretes automáticos ainda não estão disponíveis. Pra ver as pendências (secar, diagnóstico, partos), pergunte aqui "relatório reprodutivo" ou abra o Início no site.');

  elsif v_acao = 'desligar_lembretes' then
    update propriedades set lembretes_whatsapp = false where id = v_propriedade_id;
    return jsonb_build_object('ok', true, 'mensagem', 'Pode deixar: não envio lembretes automáticos.');

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
      'Não entendi o que fazer. Posso confirmar doses recebidas e cadastrar uma bezerra como vaca.');
  end if;
end;
$$;

revoke execute on function bot_acao(text, text, jsonb) from public, anon, authenticated;
grant execute on function bot_acao(text, text, jsonb) to service_role;
