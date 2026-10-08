-- Porta de entrada do bot do WhatsApp (n8n) pras regras de negócio do banco.
--
-- Até aqui o bot gravava direto nas tabelas (nós Supabase do n8n), sem passar pelas funções do
-- site — e por isso:
--   - cobertura lançada pelo WhatsApp nunca ligava ao touro do catálogo nem gastava dose do
--     programa (saldo ficava cheio, "% de uso" e taxa de concepção do programa saíam errados);
--   - parto lançado pelo WhatsApp não encerrava a lactação anterior (vaca com 2 partos ativos), não
--     vinculava a cobertura (cobertura_id sempre nulo), não arquivava a lactação e não marcava o
--     bezerro como do programa.
--
-- As funções registrar_cobertura/registrar_parto exigem auth.uid() vinculado à fazenda, e o bot
-- não tem usuário do Supabase Auth (usa a service role). Então a lógica de cada uma vira uma
-- função interna sem checagem de acesso (_registrar_*), chamada pelas duas portas:
--   - registrar_* (site): confere auth.uid() em usuarios_propriedades e chama a interna;
--   - bot_registrar_* (bot): identifica a fazenda pelo telefone (usuarios_whatsapp ativo) e chama
--     a interna. Só a service role executa (o telefone vem do webhook, não do usuário).
--
-- As funções do bot NUNCA levantam erro de regra de negócio: devolvem {ok, mensagem} já com o
-- texto da resposta pro produtor, pra o n8n só repassar (erro de exceção no nó HTTP derruba a
-- execução sem responder nada).

-- ============================================================
-- registrar_cobertura: interna + porta do site
-- ============================================================

create or replace function _registrar_cobertura(
  p_vaca_id uuid,
  p_data_cobertura date,
  p_touro_semen text,
  p_touro_id uuid,
  p_dose_programa boolean
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_touro_nome text;
  v_cobertura coberturas;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if p_dose_programa and p_touro_id is null then
    raise exception 'escolha o touro da dose do programa';
  end if;

  if p_touro_id is not null then
    select nome into v_touro_nome from touros where id = p_touro_id;
    if v_touro_nome is null then
      raise exception 'touro não encontrado';
    end if;
  end if;

  if p_dose_programa then
    perform _garantir_saldo_dose(v_propriedade_id, p_touro_id);
  end if;

  -- touro_semen continua preenchido (com o nome do catálogo quando não vier texto) porque é o
  -- campo que os relatórios do bot e as telas antigas mostram.
  insert into coberturas (vaca_id, data_cobertura, touro_semen, touro_id, dose_programa)
  values (
    p_vaca_id,
    p_data_cobertura,
    coalesce(nullif(p_touro_semen, ''), v_touro_nome),
    p_touro_id,
    coalesce(p_dose_programa, false)
  )
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;

revoke execute on function _registrar_cobertura(uuid, date, text, uuid, boolean) from public, anon, authenticated;

create or replace function registrar_cobertura(
  p_vaca_id uuid,
  p_data_cobertura date,
  p_touro_semen text default null,
  p_touro_id uuid default null,
  p_dose_programa boolean default false
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  return _registrar_cobertura(p_vaca_id, p_data_cobertura, p_touro_semen, p_touro_id, p_dose_programa);
end;
$$;

-- ============================================================
-- registrar_parto: interna + porta do site
-- ============================================================

-- Corpo igual ao de 0021_baixas_indicadores_programa.sql, sem a checagem de acesso.
create or replace function _registrar_parto(
  p_vaca_id uuid,
  p_data_parto date,
  p_numero_bezerro integer,
  p_sexo_bezerro text
) returns partos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_parto_anterior partos;
  v_iep integer;
  v_cobertura_id uuid;
  v_touro_id uuid;
  v_dose_programa boolean;
  v_novo_parto partos;
  v_numero_bezerro integer;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  -- fecha a lactação anterior (se existir) e calcula o IEP
  select * into v_parto_anterior
  from partos where vaca_id = p_vaca_id and ativa = true
  order by data_parto desc limit 1;

  if v_parto_anterior.id is not null then
    v_iep := p_data_parto - v_parto_anterior.data_parto;
    update partos set ativa = false where id = v_parto_anterior.id;
  else
    v_iep := null;
  end if;

  -- cobertura confirmada mais recente dessa vaca que ainda não gerou parto (ver 0021)
  select c.id, c.touro_id, c.dose_programa into v_cobertura_id, v_touro_id, v_dose_programa
  from coberturas c
  where c.vaca_id = p_vaca_id and c.diagnostico_prenhez = 'positivo'
    and not exists (select 1 from partos p where p.cobertura_id = c.id)
    and not exists (select 1 from partos_historico ph where ph.cobertura_id = c.id)
  order by c.data_cobertura desc limit 1;

  insert into partos (vaca_id, cobertura_id, data_parto, iep, ativa)
  values (p_vaca_id, v_cobertura_id, p_data_parto, v_iep, true)
  returning * into v_novo_parto;

  update vacas set status_produtivo = 'lactacao', status_reprodutivo = 'vazia'
  where id = p_vaca_id;

  -- Arquiva a lactação que acabou de fechar: leite, coberturas do período e o
  -- parto em si saem das tabelas principais.
  if v_parto_anterior.id is not null then
    insert into controle_leite_historico (id, vaca_id, parto_id, litros, data_controle, created_at)
    select id, vaca_id, parto_id, litros, data_controle, created_at
    from controle_leite where parto_id = v_parto_anterior.id;

    delete from controle_leite where parto_id = v_parto_anterior.id;

    -- todas as coberturas daquela lactação, exceto a que acabou de virar
    -- cobertura_id do parto novo (essa continua "viva", referenciada por um parto ativo)
    insert into coberturas_historico (id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at)
    select id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at
    from coberturas
    where vaca_id = p_vaca_id
      and data_cobertura >= v_parto_anterior.data_parto
      and data_cobertura < p_data_parto
      and id is distinct from v_cobertura_id;

    delete from coberturas
    where vaca_id = p_vaca_id
      and data_cobertura >= v_parto_anterior.data_parto
      and data_cobertura < p_data_parto
      and id is distinct from v_cobertura_id;

    -- o bezerro nascido daquela lactação continua existindo (mãe e data de
    -- nascimento já identificam a origem dele); só perde a referência direta
    -- ao parto, que agora só existe em partos_historico.
    update bezerros set parto_id = null where parto_id = v_parto_anterior.id;

    insert into partos_historico (id, vaca_id, cobertura_id, data_parto, producao_total, projecao_305, persistencia, dias_em_aberto, iep, created_at)
    select id, vaca_id, cobertura_id, data_parto, producao_total, projecao_305, persistencia, dias_em_aberto, iep, created_at
    from partos where id = v_parto_anterior.id;

    delete from partos where id = v_parto_anterior.id;
  end if;

  -- número do bezerro: mesmo espaço compartilhado de vacas/bezerros (ver 0005_bezerros.sql)
  if p_numero_bezerro is null then
    select coalesce(greatest(
      (select max(numero_identificacao) from vacas where propriedade_id = v_propriedade_id),
      (select max(numero_identificacao) from bezerros where propriedade_id = v_propriedade_id)
    ), 0) + 1 into v_numero_bezerro;
  else
    v_numero_bezerro := p_numero_bezerro;
    if exists (
      select 1 from vacas
      where propriedade_id = v_propriedade_id and numero_identificacao = v_numero_bezerro
    ) or exists (
      select 1 from bezerros
      where propriedade_id = v_propriedade_id and numero_identificacao = v_numero_bezerro
    ) then
      raise exception 'já existe um animal com o número %', v_numero_bezerro;
    end if;
  end if;

  insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento, touro_id, dose_programa)
  values (v_propriedade_id, v_novo_parto.id, p_vaca_id, v_numero_bezerro, p_sexo_bezerro, p_data_parto, v_touro_id, coalesce(v_dose_programa, false));

  return v_novo_parto;
end;
$$;

revoke execute on function _registrar_parto(uuid, date, integer, text) from public, anon, authenticated;

create or replace function registrar_parto(
  p_vaca_id uuid,
  p_data_parto date,
  p_numero_bezerro integer default null,
  p_sexo_bezerro text default null
) returns partos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  return _registrar_parto(p_vaca_id, p_data_parto, p_numero_bezerro, p_sexo_bezerro);
end;
$$;

-- ============================================================
-- funções do bot
-- ============================================================

-- Texto comparável: minúsculo, sem acento, sem espaço/pontuação ("Tarzan FIV" = "tarzanfiv").
-- unaccent não é garantido no projeto, então troca os acentos do português na mão.
create or replace function _texto_comparavel(p_texto text) returns text
language sql
immutable
as $$
  select regexp_replace(
    translate(lower(coalesce(p_texto, '')),
      'áàâãäéèêëíìîïóòôõöúùûüçñ',
      'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]', '', 'g');
$$;

-- Fazenda do telefone que mandou a mensagem (só usuário ativo). Aceita o número com ou sem o
-- sufixo do WhatsApp ("558599999999@s.whatsapp.net").
create or replace function _propriedade_do_telefone(p_telefone text) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select propriedade_id from usuarios_whatsapp
  where telefone = split_part(p_telefone, '@', 1) and ativo
  limit 1;
$$;

revoke execute on function _propriedade_do_telefone(text) from public, anon, authenticated;

-- Cobertura lançada pelo WhatsApp. O touro falado pelo produtor é procurado no catálogo (nome ou
-- código); se for um touro que a fazenda tem saldo do programa, a cobertura gasta uma dose.
-- Sem touro reconhecido, registra como antes (só o texto), e a resposta avisa.
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
  v_propriedade_id uuid;
  v_vaca_id uuid;
  v_alvo text := _texto_comparavel(p_touro_texto);
  v_touro touros;
  v_qtd_programa integer;
  v_dose_programa boolean := false;
  v_saldo integer;
  v_data_br text := to_char(p_data_cobertura, 'DD/MM/YYYY');
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
    perform _registrar_cobertura(v_vaca_id, p_data_cobertura, p_touro_texto, v_touro.id, v_dose_programa);
  exception when others then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não consegui registrar a cobertura da vaca %s: %s.', p_numero_vaca, sqlerrm));
  end;

  v_msg := format('Cobertura da vaca %s registrada em %s', p_numero_vaca, v_data_br);

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
    'saldo_restante', v_saldo
  );
end;
$$;

revoke execute on function bot_registrar_cobertura(text, integer, date, text) from public, anon, authenticated;
grant execute on function bot_registrar_cobertura(text, integer, date, text) to service_role;

-- Parto lançado pelo WhatsApp: mesma regra do site (encerra e arquiva a lactação anterior, IEP,
-- vincula a cobertura, cria o bezerro com pai/dose do programa).
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
  v_propriedade_id uuid;
  v_vaca_id uuid;
  v_parto partos;
  v_bezerro bezerros;
  v_touro_nome text;
  v_sexo text := nullif(lower(trim(coalesce(p_sexo_bezerro, ''))), '');
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

  if v_sexo is not null and v_sexo not in ('macho', 'femea', 'natimorto') then
    v_sexo := null;
  end if;

  begin
    v_parto := _registrar_parto(v_vaca_id, p_data_parto, p_numero_bezerro, v_sexo);
  exception when others then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não consegui registrar o parto da vaca %s: %s.', p_numero_vaca, sqlerrm));
  end;

  -- o bot gravava vacas.data_parto; os relatórios dele ainda podem ler esse campo
  update vacas set data_parto = p_data_parto where id = v_vaca_id;

  select * into v_bezerro from bezerros where parto_id = v_parto.id limit 1;
  select nome into v_touro_nome from touros where id = v_bezerro.touro_id;

  v_msg := format('Parto da vaca %s registrado em %s.', p_numero_vaca, to_char(p_data_parto, 'DD/MM/YYYY'));
  v_msg := v_msg || format(' %s número %s.',
    case v_bezerro.sexo when 'femea' then 'Bezerra' when 'macho' then 'Bezerro' when 'natimorto' then 'Natimorto' else 'Cria' end,
    v_bezerro.numero_identificacao);
  if v_bezerro.dose_programa then
    v_msg := v_msg || format(' Nascido de dose do programa (touro %s).', v_touro_nome);
  elsif v_touro_nome is not null then
    v_msg := v_msg || format(' Pai: touro %s.', v_touro_nome);
  end if;
  if v_parto.iep is not null then
    v_msg := v_msg || format(' Lactação anterior encerrada; intervalo entre partos: %s dias.', v_parto.iep);
  end if;

  return jsonb_build_object(
    'ok', true,
    'mensagem', v_msg,
    'numero_bezerro', v_bezerro.numero_identificacao,
    'iep', v_parto.iep,
    'dose_programa', v_bezerro.dose_programa
  );
end;
$$;

revoke execute on function bot_registrar_parto(text, integer, date, integer, text) from public, anon, authenticated;
grant execute on function bot_registrar_parto(text, integer, date, integer, text) to service_role;
