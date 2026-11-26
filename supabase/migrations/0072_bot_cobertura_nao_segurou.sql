-- "A cobertura do dia 18/10 não segurou, repetiu o cio dia 26/11" pelo WhatsApp (26/11/2026, vaca 2):
-- o bot recusou com "essa vaca já tem uma prenhez confirmada... não faz sentido registrar nova
-- cobertura antes do parto" e o produtor ficou sem saída. A recusa vinha de um nó em JavaScript do
-- n8n ("Validar Cobertura"), que repetia a regra do banco (0052) com uma mensagem pior.
--
-- Agora:
--   - p_anterior_nao_segurou = true (a IA marca quando o produtor diz que a anterior não segurou,
--     que repetiu/voltou ao cio, que perdeu a prenhez): a cobertura atual de antes da data nova
--     (positiva ou pendente) vira negativa e a nova é registrada, na mesma transação. Sem a marca,
--     vale a recusa de 0052 ("se ela perdeu a prenhez, registre o diagnóstico negativo...").
--   - cobertura repetida (mesma vaca, mesma data) é recusada aqui — era a outra checagem do nó
--     do n8n, que sai do workflow.

-- A regra fica em _bot_registrar_cobertura_sem_nome (0066_bot_nome_nas_respostas); bot_registrar_cobertura
-- só põe o nome da vaca na resposta. As duas ganham o parâmetro novo (opcional: o n8n antigo continua
-- funcionando).

drop function if exists bot_registrar_cobertura(text, integer, date, text);
drop function if exists _bot_registrar_cobertura_sem_nome(text, integer, date, text);

create or replace function _bot_registrar_cobertura_sem_nome(
  p_telefone text,
  p_numero_vaca integer,
  p_data_cobertura date,
  p_touro_texto text default null,
  p_anterior_nao_segurou boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_vaca_id uuid;
  v_alvo text := _texto_comparavel(p_touro_texto);
  v_touro touros;
  v_qtd_programa integer;
  v_dose_programa boolean := false;
  v_saldo integer;
  v_data_br text := to_char(p_data_cobertura, 'DD/MM/YYYY');
  v_anterior coberturas_atuais;
  v_msg text;
begin
  v_propriedade_id := _propriedade_do_telefone(p_telefone);
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  select id into v_vaca_id from vacas
  where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_vaca;
  if v_vaca_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', p_numero_vaca));
  end if;

  if exists (select 1 from coberturas where vaca_id = v_vaca_id and data_cobertura = p_data_cobertura) then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Já existe uma cobertura da vaca %s em %s. Não lancei de novo pra não duplicar.', p_numero_vaca, v_data_br));
  end if;

  if v_alvo <> '' then
    -- 1º: touros com saldo do programa nesta fazenda
    select count(*) into v_qtd_programa
    from touros t join saldo_doses s on s.touro_id = t.id
    where s.propriedade_id = v_propriedade_id and s.saldo > 0
      and (_texto_comparavel(t.nome) = v_alvo or _texto_comparavel(t.codigo) = v_alvo);

    if v_qtd_programa = 1 then
      select t.* into v_touro
      from touros t join saldo_doses s on s.touro_id = t.id
      where s.propriedade_id = v_propriedade_id and s.saldo > 0
        and (_texto_comparavel(t.nome) = v_alvo or _texto_comparavel(t.codigo) = v_alvo);
      v_dose_programa := true;
    elsif v_qtd_programa = 0 then
      -- 2º: qualquer touro do catálogo (liga o pai, mas não gasta dose)
      select t.* into v_touro from touros t
      where _texto_comparavel(t.nome) = v_alvo or _texto_comparavel(t.codigo) = v_alvo
      order by t.ativo desc, t.created_at
      limit 1;
    end if;
    -- v_qtd_programa > 1 (nome ambíguo entre touros do programa): não adivinha, registra só o texto
  end if;

  begin
    if coalesce(p_anterior_nao_segurou, false) then
      select * into v_anterior from coberturas_atuais
      where vaca_id = v_vaca_id and data_cobertura < p_data_cobertura
        and diagnostico_prenhez in ('positivo', 'pendente');
      if v_anterior.id is not null then
        update coberturas set diagnostico_prenhez = 'negativo' where id = v_anterior.id;
      end if;
    end if;

    perform _registrar_cobertura(v_vaca_id, p_data_cobertura, p_touro_texto, v_touro.id, v_dose_programa);
  exception when others then
    -- o bloco desfaz também o negativo da anterior
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não consegui registrar a cobertura da vaca %s: %s.', p_numero_vaca, sqlerrm));
  end;

  v_msg := '';
  if v_anterior.id is not null then
    v_msg := format('Cobertura de %s marcada como não segurou (diagnóstico negativo). ',
      to_char(v_anterior.data_cobertura, 'DD/MM/YYYY'));
  end if;
  v_msg := v_msg || format('Cobertura da vaca %s registrada em %s', p_numero_vaca, v_data_br);

  if v_dose_programa then
    select saldo into v_saldo from saldo_doses
    where propriedade_id = v_propriedade_id and touro_id = v_touro.id;
    v_msg := v_msg || format(' com dose do programa (touro %s). Restam %s %s desse touro.',
      v_touro.nome, coalesce(v_saldo, 0), case when coalesce(v_saldo, 0) = 1 then 'dose' else 'doses' end);
  elsif v_touro.id is not null then
    v_msg := v_msg || format(' (touro %s, fora das doses do programa).', v_touro.nome);
  elsif v_alvo <> '' then
    v_msg := v_msg || format(' (sêmen/touro: %s).', p_touro_texto);
    if v_qtd_programa > 1 then
      v_msg := v_msg || ' Esse nome bate com mais de um touro do programa — mande o código do touro pra eu descontar a dose certa.';
    elsif exists (select 1 from saldo_doses where propriedade_id = v_propriedade_id and saldo > 0) then
      v_msg := v_msg || ' Não reconheci esse touro nas doses do programa, então não descontei dose. Se foi dose do programa, mande o nome ou código do touro como está no catálogo.';
    end if;
  else
    v_msg := v_msg || '.';
    if exists (select 1 from saldo_doses where propriedade_id = v_propriedade_id and saldo > 0) then
      v_msg := v_msg || ' Se foi com dose do programa, me diga o touro pra eu descontar do saldo.';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'mensagem', v_msg || ' Diagnóstico de prenhez: pendente.',
    'dose_programa', v_dose_programa,
    'touro', v_touro.nome,
    'saldo_restante', v_saldo,
    'anterior_negativada', v_anterior.id is not null
  );
end;
$$;
revoke execute on function _bot_registrar_cobertura_sem_nome(text, integer, date, text, boolean) from public, anon, authenticated;
grant execute on function _bot_registrar_cobertura_sem_nome(text, integer, date, text, boolean) to service_role;

create or replace function bot_registrar_cobertura(
  p_telefone text,
  p_numero_vaca integer,
  p_data_cobertura date,
  p_touro_texto text default null,
  p_anterior_nao_segurou boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  v_resposta := _bot_registrar_cobertura_sem_nome(p_telefone, p_numero_vaca, p_data_cobertura, p_touro_texto,
    p_anterior_nao_segurou);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;
revoke execute on function bot_registrar_cobertura(text, integer, date, text, boolean) from public, anon, authenticated;
grant execute on function bot_registrar_cobertura(text, integer, date, text, boolean) to service_role;
