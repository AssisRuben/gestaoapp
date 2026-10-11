-- Testes de regressão para as funções RPC de negócio: cadastrar_vaca, registrar_parto
-- (incluindo o arquivamento de lactação encerrada), secar_vaca, confirmar_diagnostico, o
-- saldo e baixa de doses do programa de sêmen, indicadores reprodutivos do programa, as
-- funções do bot do WhatsApp e o cálculo de indicadores da linha de base.
--
-- Como rodar: cole este arquivo inteiro no SQL Editor do Supabase e execute. Roda inteiro
-- dentro de uma transação e sempre termina com ROLLBACK — não deixa nenhum dado de teste
-- no banco (nem em caso de falha, já que um erro não tratado também desfaz a transação).
-- Pode rodar quantas vezes quiser, a qualquer momento.
--
-- Se tudo passar: "NOTICE: TODOS OS TESTES PASSARAM" no final.
-- Se algo falhar: o editor mostra o erro com "FALHOU [nome_da_funcao]: ..." dizendo o que
-- quebrou.
--
-- Usa um usuário já existente em auth.users pra representar "quem está logado" (nenhuma
-- função aqui roda sem um auth.uid() vinculado à propriedade) — precisa existir pelo menos
-- uma conta cadastrada no projeto pra rodar este arquivo.

begin;

do $$
declare
  v_usuario_id uuid;
  v_propriedade_id uuid;
  v_vaca_mae_id uuid;
  v_vaca_filha_id uuid;
  v_bezerro_1 uuid;
  v_bezerro_2 uuid;
  v_cobertura_a uuid;
  v_cobertura_b uuid;
  v_cobertura_c uuid;
  v_parto_1 partos;
  v_parto_2 partos;
  v_status text;
  v_touro_id uuid;
  v_entrega_id uuid;
  v_vaca_prog_id uuid;
  v_cob_prog_1 uuid;
  v_cob_prog_2 uuid;
  v_cob_prog_3 uuid;
  v_saldo integer;
  v_prop_ind uuid;
  v_vaca_a uuid;
  v_vaca_b uuid;
  v_vaca_c uuid;
  v_parto_a uuid;
  v_parto_b uuid;
  v_ind record;
  v_baixa_id uuid;
  v_bezerro_parto2 bezerros;
  v_bot jsonb;
  v_tecnico_id uuid;
  v_prop_sem uuid;
  v_qtd integer;
  v_vaca_status uuid;
  v_cob_status uuid;
  v_vaca_bot uuid;
  v_alvo_bot jsonb;
  v_num_auto integer;
begin
  select id into v_usuario_id from auth.users limit 1;
  if v_usuario_id is null then
    raise exception 'nenhum usuário em auth.users — crie ao menos uma conta antes de rodar os testes';
  end if;

  insert into propriedades (nome_propriedade, nome_produtor)
  values ('__teste_rpc__', '__teste_rpc__')
  returning id into v_propriedade_id;

  insert into usuarios_propriedades (usuario_id, propriedade_id)
  values (v_usuario_id, v_propriedade_id);

  -- impersona esse usuário nesta transação — é assim que auth.uid() (usado em todas as
  -- checagens de autorização das funções) sabe "quem está logado" fora de uma requisição real
  perform set_config('request.jwt.claim.sub', v_usuario_id::text, true);

  -- ============================================================
  -- cadastrar_vaca
  -- ============================================================

  perform cadastrar_vaca(v_propriedade_id);
  if not exists (select 1 from vacas where propriedade_id = v_propriedade_id and numero_identificacao = 1) then
    raise exception 'FALHOU [cadastrar_vaca]: sem número explícito deveria começar em 1';
  end if;
  select id into v_vaca_mae_id from vacas where propriedade_id = v_propriedade_id and numero_identificacao = 1;

  perform cadastrar_vaca(v_propriedade_id);
  if not exists (select 1 from vacas where propriedade_id = v_propriedade_id and numero_identificacao = 2) then
    raise exception 'FALHOU [cadastrar_vaca]: numeração deveria ser sequencial (MAX+1)';
  end if;

  begin
    perform cadastrar_vaca(v_propriedade_id, 1);
    raise exception 'FALHOU [cadastrar_vaca]: deveria rejeitar número 1 duplicado';
  exception when others then
    if sqlerrm not ilike '%já existe uma vaca%' then
      raise exception 'FALHOU [cadastrar_vaca]: erro inesperado no teste de duplicata: %', sqlerrm;
    end if;
  end;

  -- bezerro "antigo" (sem número, cadastrado antes da regra 4 existir) — deve linkar pelo
  -- fallback (mais recente sem vaca_id_gerada)
  insert into bezerros (propriedade_id, mae_id, sexo, data_nascimento)
  values (v_propriedade_id, v_vaca_mae_id, 'femea', current_date - 400)
  returning id into v_bezerro_1;

  perform cadastrar_vaca(v_propriedade_id, null, v_vaca_mae_id);
  if not exists (select 1 from bezerros where id = v_bezerro_1 and vaca_id_gerada is not null) then
    raise exception 'FALHOU [cadastrar_vaca]: deveria linkar o bezerro sem número pelo fallback (created_at)';
  end if;

  -- bezerro "novo" (com número, gerado por um parto) — deve linkar pelo número, etapa 1
  insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
  values (v_propriedade_id, v_vaca_mae_id, 50, 'femea', current_date - 10)
  returning id into v_bezerro_2;

  perform cadastrar_vaca(v_propriedade_id, 50, v_vaca_mae_id);
  if not exists (select 1 from bezerros where id = v_bezerro_2 and vaca_id_gerada is not null) then
    raise exception 'FALHOU [cadastrar_vaca]: deveria linkar o bezerro pelo número quando o número bate (etapa 1)';
  end if;

  -- ============================================================
  -- registrar_parto + arquivamento de lactação encerrada
  -- ============================================================

  select id into v_vaca_filha_id from vacas where propriedade_id = v_propriedade_id and numero_identificacao = 50;

  -- cobertura que resultou no primeiro parto — fica fora de qualquer janela de arquivamento
  -- (a janela só cobre o período ENTRE dois partos), deve continuar viva pra sempre
  perform registrar_cobertura(v_vaca_filha_id, current_date - 400, 'touro-teste-1');
  select id into v_cobertura_a from coberturas where vaca_id = v_vaca_filha_id order by data_cobertura desc limit 1;
  perform confirmar_diagnostico(v_cobertura_a, 'positivo');

  -- 300 dias antes do segundo parto: menos de 240 é recusado como parto duplicado (0039)
  v_parto_1 := registrar_parto(v_vaca_filha_id, current_date - 300, 101, 'femea');
  if v_parto_1.iep is not null then
    raise exception 'FALHOU [registrar_parto]: primeiro parto da vaca deveria ter iep null';
  end if;
  if v_parto_1.cobertura_id is distinct from v_cobertura_a then
    raise exception 'FALHOU [registrar_parto]: cobertura_id do primeiro parto deveria ser a confirmada positiva';
  end if;

  select status_produtivo into v_status from vacas where id = v_vaca_filha_id;
  if v_status <> 'lactacao' then
    raise exception 'FALHOU [registrar_parto]: status_produtivo deveria virar lactacao';
  end if;

  -- leite lançado durante a lactação que está prestes a fechar
  insert into controle_leite (vaca_id, parto_id, litros, data_controle)
  values (v_vaca_filha_id, v_parto_1.id, 18, current_date - 100);

  -- tentativa de cobertura que falhou durante a lactação — deve ser arquivada junto quando a
  -- lactação fechar
  perform registrar_cobertura(v_vaca_filha_id, current_date - 150, 'touro-teste-2');
  select id into v_cobertura_c from coberturas where vaca_id = v_vaca_filha_id and data_cobertura = current_date - 150;
  perform confirmar_diagnostico(v_cobertura_c, 'negativo');

  -- cobertura que emplacou — vira cobertura_id do próximo parto, deve continuar viva
  perform registrar_cobertura(v_vaca_filha_id, current_date - 60, 'touro-teste-3');
  select id into v_cobertura_b from coberturas where vaca_id = v_vaca_filha_id and data_cobertura = current_date - 60;
  perform confirmar_diagnostico(v_cobertura_b, 'positivo');

  v_parto_2 := registrar_parto(v_vaca_filha_id, current_date, 102, 'macho');

  if v_parto_2.iep is distinct from 300 then
    raise exception 'FALHOU [registrar_parto]: iep do segundo parto calculado errado (esperado 300, veio %)', v_parto_2.iep;
  end if;
  if v_parto_2.cobertura_id is distinct from v_cobertura_b then
    raise exception 'FALHOU [registrar_parto]: cobertura_id do parto novo deveria ser a confirmada mais recente';
  end if;

  if exists (select 1 from partos where id = v_parto_1.id) then
    raise exception 'FALHOU [arquivamento]: o parto fechado deveria ter saído de partos';
  end if;
  if not exists (select 1 from partos_historico where id = v_parto_1.id) then
    raise exception 'FALHOU [arquivamento]: o parto fechado deveria estar em partos_historico';
  end if;

  if exists (select 1 from controle_leite where parto_id = v_parto_1.id) then
    raise exception 'FALHOU [arquivamento]: leite da lactação fechada deveria ter saído de controle_leite';
  end if;
  if not exists (select 1 from controle_leite_historico where parto_id = v_parto_1.id) then
    raise exception 'FALHOU [arquivamento]: leite da lactação fechada deveria estar em controle_leite_historico';
  end if;

  if exists (select 1 from coberturas where id = v_cobertura_c) then
    raise exception 'FALHOU [arquivamento]: cobertura negativa dentro da lactação fechada deveria ter saído de coberturas';
  end if;
  if not exists (select 1 from coberturas_historico where id = v_cobertura_c) then
    raise exception 'FALHOU [arquivamento]: cobertura negativa dentro da lactação fechada deveria estar em coberturas_historico';
  end if;

  if not exists (select 1 from coberturas where id = v_cobertura_b) then
    raise exception 'FALHOU [arquivamento]: a cobertura vinculada ao parto novo não deveria ser arquivada';
  end if;
  if not exists (select 1 from coberturas where id = v_cobertura_a) then
    raise exception 'FALHOU [arquivamento]: a cobertura anterior ao primeiro parto não deveria ser arquivada (fica fora de qualquer janela)';
  end if;

  if not exists (select 1 from bezerros where parto_id is null and mae_id = v_vaca_filha_id and numero_identificacao = 101) then
    raise exception 'FALHOU [arquivamento]: bezerro do parto arquivado deveria ter parto_id nulo, mas continuar existindo';
  end if;

  -- ============================================================
  -- secar_vaca
  -- ============================================================

  begin
    perform secar_vaca(v_vaca_mae_id); -- essa vaca é 'novilha', não 'lactacao'
    raise exception 'FALHOU [secar_vaca]: deveria rejeitar vaca que não está em lactação';
  exception when others then
    if sqlerrm not ilike '%só é possível secar%' then
      raise exception 'FALHOU [secar_vaca]: erro inesperado: %', sqlerrm;
    end if;
  end;

  perform secar_vaca(v_vaca_filha_id); -- essa está em lactacao (do segundo parto)
  select status_produtivo into v_status from vacas where id = v_vaca_filha_id;
  if v_status <> 'seca' then
    raise exception 'FALHOU [secar_vaca]: deveria marcar a vaca como seca';
  end if;

  -- ============================================================
  -- confirmar_diagnostico (regra 3 do CLAUDE.md: só a cobertura certa, nunca todas da vaca)
  -- ============================================================

  perform registrar_cobertura(v_vaca_mae_id, current_date - 20, 'touro-teste-4');
  perform registrar_cobertura(v_vaca_mae_id, current_date - 5, 'touro-teste-5');

  perform confirmar_diagnostico(
    (select id from coberturas where vaca_id = v_vaca_mae_id and data_cobertura = current_date - 5),
    'negativo'
  );

  if (select diagnostico_prenhez from coberturas where vaca_id = v_vaca_mae_id and data_cobertura = current_date - 20) <> 'pendente' then
    raise exception 'FALHOU [confirmar_diagnostico]: não deveria alterar outras coberturas da mesma vaca';
  end if;

  if (select diagnostico_prenhez from coberturas where vaca_id = v_vaca_mae_id and data_cobertura = current_date - 5) <> 'negativo' then
    raise exception 'FALHOU [confirmar_diagnostico]: deveria ter atualizado a cobertura certa';
  end if;

  begin
    perform confirmar_diagnostico(
      (select id from coberturas where vaca_id = v_vaca_mae_id and data_cobertura = current_date - 20),
      'talvez'
    );
    raise exception 'FALHOU [confirmar_diagnostico]: deveria rejeitar diagnóstico inválido';
  exception when others then
    if sqlerrm not ilike '%diagnóstico inválido%' then
      raise exception 'FALHOU [confirmar_diagnostico]: erro inesperado no teste de valor inválido: %', sqlerrm;
    end if;
  end;

  -- ============================================================
  -- programa de sêmen: saldo de doses (0018_programa_semen.sql)
  -- ============================================================

  insert into touros (nome, codigo) values ('__touro_teste__', '__TESTE__') returning id into v_touro_id;
  insert into entregas_doses (propriedade_id, touro_id, quantidade, data_entrega)
  values (v_propriedade_id, v_touro_id, 3, current_date - 320)
  returning id into v_entrega_id;

  v_vaca_prog_id := (cadastrar_vaca(v_propriedade_id)).id;

  begin
    perform registrar_cobertura(v_vaca_prog_id, current_date - 300, null, v_touro_id, true);
    raise exception 'FALHOU [programa]: entrega não confirmada não deveria dar saldo';
  exception when others then
    if sqlerrm not ilike '%confirme o recebimento%' then
      raise exception 'FALHOU [programa]: erro inesperado sem confirmação: %', sqlerrm;
    end if;
  end;

  perform confirmar_recebimento_doses(v_entrega_id);

  begin
    perform confirmar_recebimento_doses(v_entrega_id);
    raise exception 'FALHOU [programa]: não deveria confirmar a mesma entrega duas vezes';
  exception when others then
    if sqlerrm not ilike '%já foi confirmada%' then
      raise exception 'FALHOU [programa]: erro inesperado na confirmação dupla: %', sqlerrm;
    end if;
  end;

  v_cob_prog_1 := (registrar_cobertura(v_vaca_prog_id, current_date - 400, null, v_touro_id, true)).id;
  if (select touro_semen from coberturas where id = v_cob_prog_1) is distinct from '__touro_teste__' then
    raise exception 'FALHOU [programa]: touro_semen deveria receber o nome do touro do catálogo';
  end if;
  perform confirmar_diagnostico(v_cob_prog_1, 'positivo');
  perform registrar_parto(v_vaca_prog_id, current_date - 300, null, 'femea');

  if not exists (
    select 1 from bezerros where mae_id = v_vaca_prog_id and touro_id = v_touro_id
  ) then
    raise exception 'FALHOU [programa]: bezerro deveria herdar o touro da cobertura do parto';
  end if;

  v_cob_prog_2 := (registrar_cobertura(v_vaca_prog_id, current_date - 150, null, v_touro_id, true)).id;
  perform confirmar_diagnostico(v_cob_prog_2, 'negativo');

  v_cob_prog_3 := (registrar_cobertura(v_vaca_prog_id, current_date - 100, null, v_touro_id, true)).id;

  select saldo into v_saldo from saldo_doses
  where propriedade_id = v_propriedade_id and touro_id = v_touro_id;
  if v_saldo is distinct from 0 then
    raise exception 'FALHOU [programa]: saldo deveria ser 0 depois de usar as 3 doses (veio %)', v_saldo;
  end if;

  begin
    perform registrar_cobertura(v_vaca_prog_id, current_date - 90, null, v_touro_id, true);
    raise exception 'FALHOU [programa]: não deveria usar dose sem saldo';
  exception when others then
    if sqlerrm not ilike '%sem saldo%' then
      raise exception 'FALHOU [programa]: erro inesperado sem saldo: %', sqlerrm;
    end if;
  end;

  -- excluir uma cobertura lançada por engano devolve a dose
  perform deletar_cobertura(v_cob_prog_3);
  select saldo into v_saldo from saldo_doses
  where propriedade_id = v_propriedade_id and touro_id = v_touro_id;
  if v_saldo is distinct from 1 then
    raise exception 'FALHOU [programa]: excluir a cobertura deveria devolver a dose (saldo esperado 1, veio %)', v_saldo;
  end if;

  -- o segundo parto arquiva a cobertura negativa; a dose dela continua contando como usada
  perform registrar_parto(v_vaca_prog_id, current_date, null, 'macho');
  if not exists (
    select 1 from coberturas_historico where id = v_cob_prog_2 and dose_programa and touro_id = v_touro_id
  ) then
    raise exception 'FALHOU [programa]: arquivamento deveria levar touro_id e dose_programa pro histórico';
  end if;

  select saldo into v_saldo from saldo_doses
  where propriedade_id = v_propriedade_id and touro_id = v_touro_id;
  if v_saldo is distinct from 1 then
    raise exception 'FALHOU [programa]: arquivar a cobertura não deveria devolver a dose ao saldo (esperado 1, veio %)', v_saldo;
  end if;

  -- o segundo parto não tem cobertura positiva nova (a de 300 dias atrás já gerou o primeiro):
  -- não pode herdar o touro/dose do parto anterior
  if (select cobertura_id from partos where vaca_id = v_vaca_prog_id and ativa) is not null then
    raise exception 'FALHOU [registrar_parto]: segundo parto não deveria reaproveitar cobertura que já gerou parto';
  end if;
  select * into v_bezerro_parto2 from bezerros
  where mae_id = v_vaca_prog_id and data_nascimento = current_date;
  if v_bezerro_parto2.dose_programa or v_bezerro_parto2.touro_id is not null then
    raise exception 'FALHOU [registrar_parto]: bezerro do segundo parto não deveria contar como do programa';
  end if;

  -- ============================================================
  -- indicadores_reprodutivos_programa (0021)
  -- ============================================================
  -- doses usadas: a de 300 dias (positiva, pariu) e a de 150 (negativa, arquivada)
  select * into v_ind from indicadores_reprodutivos_programa where propriedade_id = v_propriedade_id;
  if v_ind.doses_usadas <> 2 or v_ind.prenhezes <> 1 or v_ind.negativos <> 1 or v_ind.matrizes_inseminadas <> 1 then
    raise exception 'FALHOU [indicadores_programa]: contagem errada (doses %, prenhezes %, negativos %, matrizes %)',
      v_ind.doses_usadas, v_ind.prenhezes, v_ind.negativos, v_ind.matrizes_inseminadas;
  end if;
  if v_ind.taxa_concepcao <> 50.0 or v_ind.doses_por_prenhez <> 2.00 then
    raise exception 'FALHOU [indicadores_programa]: taxa % / doses por prenhez % (esperado 50 / 2)',
      v_ind.taxa_concepcao, v_ind.doses_por_prenhez;
  end if;
  if v_ind.gestacoes_em_curso <> 0 or v_ind.nascimentos <> 1 or v_ind.femeas <> 1 then
    raise exception 'FALHOU [indicadores_programa]: gestações % / nascimentos % / fêmeas % (esperado 0 / 1 / 1)',
      v_ind.gestacoes_em_curso, v_ind.nascimentos, v_ind.femeas;
  end if;

  -- ============================================================
  -- baixa de doses (0021) — saldo atual desse touro: 1
  -- ============================================================
  begin
    perform registrar_baixa_doses(v_propriedade_id, v_touro_id, 2, 'perda', current_date);
    raise exception 'FALHOU [baixa]: não deveria baixar mais doses do que o saldo';
  exception when others then
    if sqlerrm not ilike '%sem saldo%' then
      raise exception 'FALHOU [baixa]: erro inesperado: %', sqlerrm;
    end if;
  end;

  begin
    perform registrar_baixa_doses(v_propriedade_id, v_touro_id, 1, 'roubada', current_date);
    raise exception 'FALHOU [baixa]: deveria rejeitar motivo inválido';
  exception when others then
    if sqlerrm not ilike '%motivo inválido%' then
      raise exception 'FALHOU [baixa]: erro inesperado no motivo: %', sqlerrm;
    end if;
  end;

  v_baixa_id := (registrar_baixa_doses(v_propriedade_id, v_touro_id, 1, 'perda', current_date, 'botijão')).id;
  select saldo into v_saldo from saldo_doses where propriedade_id = v_propriedade_id and touro_id = v_touro_id;
  if v_saldo is distinct from 0 then
    raise exception 'FALHOU [baixa]: saldo deveria zerar depois da baixa (veio %)', v_saldo;
  end if;

  begin
    perform registrar_cobertura(v_vaca_prog_id, current_date, null, v_touro_id, true);
    raise exception 'FALHOU [baixa]: dose baixada não deveria poder ser usada';
  exception when others then
    if sqlerrm not ilike '%sem saldo%' then
      raise exception 'FALHOU [baixa]: erro inesperado ao usar dose baixada: %', sqlerrm;
    end if;
  end;

  perform deletar_baixa_doses(v_baixa_id);
  select saldo into v_saldo from saldo_doses where propriedade_id = v_propriedade_id and touro_id = v_touro_id;
  if v_saldo is distinct from 1 then
    raise exception 'FALHOU [baixa]: desfazer a baixa deveria devolver a dose (veio %)', v_saldo;
  end if;

  -- ============================================================
  -- funções do bot (0022) — saldo desse touro: 1; vaca número 1 = v_vaca_mae_id
  -- ============================================================
  insert into usuarios_whatsapp (propriedade_id, telefone) values (v_propriedade_id, '5500000000001');

  v_bot := bot_registrar_cobertura('5599999999999@s.whatsapp.net', 1, current_date, 'qualquer');
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot]: telefone não cadastrado deveria ser recusado';
  end if;

  v_bot := bot_registrar_cobertura('5500000000001@s.whatsapp.net', 9999, current_date, null);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%não encontrei a vaca 9999%' then
    raise exception 'FALHOU [bot]: vaca inexistente deveria responder sem erro (veio %)', v_bot;
  end if;

  -- nome falado com acento/maiúscula/espaço diferente do catálogo ('__touro_teste__')
  v_bot := bot_registrar_cobertura('5500000000001@s.whatsapp.net', 1, current_date, 'Touro Testé');
  if not (v_bot->>'ok')::boolean or not (v_bot->>'dose_programa')::boolean then
    raise exception 'FALHOU [bot]: touro do programa com saldo deveria gastar dose (veio %)', v_bot;
  end if;
  if (v_bot->>'saldo_restante')::integer <> 0 then
    raise exception 'FALHOU [bot]: saldo restante deveria ser 0 (veio %)', v_bot->>'saldo_restante';
  end if;
  if not exists (
    select 1 from coberturas where vaca_id = v_vaca_mae_id and data_cobertura = current_date
      and touro_id = v_touro_id and dose_programa
  ) then
    raise exception 'FALHOU [bot]: cobertura do bot deveria ficar ligada ao touro e à dose';
  end if;

  -- sem saldo: liga o touro do catálogo, mas não gasta dose
  v_bot := bot_registrar_cobertura('5500000000001', 1, current_date - 1, '__TESTE__');
  if not (v_bot->>'ok')::boolean or (v_bot->>'dose_programa')::boolean then
    raise exception 'FALHOU [bot]: sem saldo, deveria registrar sem dose do programa (veio %)', v_bot;
  end if;

  -- parto pelo bot passa pela mesma regra do site (cria bezerro, status lactação)
  v_bot := bot_registrar_parto('5500000000001@s.whatsapp.net', 1, current_date, null, 'Femea');
  if not (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot_registrar_parto]: deveria registrar (veio %)', v_bot;
  end if;
  if (select status_produtivo from vacas where id = v_vaca_mae_id) <> 'lactacao'
     or not exists (select 1 from bezerros where mae_id = v_vaca_mae_id and data_nascimento = current_date and sexo = 'femea') then
    raise exception 'FALHOU [bot_registrar_parto]: deveria criar a bezerra e pôr a vaca em lactação';
  end if;

  -- numa vaca sem parto (na vaca 1, um segundo parto no mesmo dia já cai na trava de duplicado, 0039)
  insert into vacas (propriedade_id, numero_identificacao, status_produtivo) values (v_propriedade_id, 90960, 'novilha');
  v_bot := bot_registrar_parto('5500000000001', 90960, current_date, 1, null);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%já existe um animal%' then
    raise exception 'FALHOU [bot_registrar_parto]: número de bezerro repetido deveria virar mensagem (veio %)', v_bot;
  end if;

  -- ============================================================
  -- calcular_indicadores / sugerir_linha_base (0019_adesao_linha_base.sql)
  -- ============================================================

  -- fazenda separada, com dados montados à mão pra conferir cada número
  insert into propriedades (nome_propriedade, nome_produtor)
  values ('__teste_indicadores__', '__teste__') returning id into v_prop_ind;
  insert into usuarios_propriedades (usuario_id, propriedade_id) values (v_usuario_id, v_prop_ind);

  insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
  values (v_prop_ind, 1, 'lactacao') returning id into v_vaca_a;
  insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
  values (v_prop_ind, 2, 'lactacao') returning id into v_vaca_b;
  insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
  values (v_prop_ind, 3, 'seca') returning id into v_vaca_c;
  insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
  values (v_prop_ind, 4, 'novilha');

  insert into partos (vaca_id, data_parto) values (v_vaca_a, current_date - 60) returning id into v_parto_a;
  insert into partos (vaca_id, data_parto) values (v_vaca_b, current_date - 60) returning id into v_parto_b;

  -- vaca A: 10 + 8 no mesmo dia (= 18) e 20 noutro dia; vaca B: 14; pesagem de 40 dias atrás
  -- fica fora da janela de 30 dias. Média por vaca/dia = (18 + 20 + 14) / 3 = 17.33
  insert into controle_leite (vaca_id, parto_id, litros, data_controle) values
    (v_vaca_a, v_parto_a, 10, current_date - 1),
    (v_vaca_a, v_parto_a, 8, current_date - 1),
    (v_vaca_a, v_parto_a, 20, current_date - 5),
    (v_vaca_b, v_parto_b, 14, current_date - 2),
    (v_vaca_b, v_parto_b, 100, current_date - 40);

  insert into bezerros (propriedade_id, mae_id, sexo, numero_identificacao) values
    (v_prop_ind, v_vaca_a, 'femea', 10),
    (v_prop_ind, v_vaca_b, 'macho', 11),
    (v_prop_ind, v_vaca_c, 'natimorto', 12);

  -- dois meses com lançamento (5 e 70 dias atrás caem sempre em meses diferentes); o de 400
  -- dias atrás fica fora da janela de 12 meses
  insert into financeiro (propriedade_id, tipo, categoria, valor, data) values
    (v_prop_ind, 'receita', 'venda de leite', 6000, current_date - 5),
    (v_prop_ind, 'despesa', 'racao', 3000, current_date - 5),
    (v_prop_ind, 'despesa', 'racao', 1000, current_date - 70),
    (v_prop_ind, 'despesa', 'racao', 9999, current_date - 400);

  select * into v_ind from calcular_indicadores(v_prop_ind, current_date);

  if v_ind.total_animais <> 6 then
    raise exception 'FALHOU [indicadores]: total_animais esperado 6 (4 vacas + 2 crias vivas), veio %', v_ind.total_animais;
  end if;
  if v_ind.matrizes <> 3 or v_ind.vacas_lactacao <> 2 or v_ind.novilhas <> 1 or v_ind.bezerras <> 1 then
    raise exception 'FALHOU [indicadores]: rebanho errado (matrizes %, lactação %, novilhas %, bezerras %)',
      v_ind.matrizes, v_ind.vacas_lactacao, v_ind.novilhas, v_ind.bezerras;
  end if;
  if v_ind.litros_vaca_dia <> 17.33 then
    raise exception 'FALHOU [indicadores]: litros_vaca_dia esperado 17.33, veio %', v_ind.litros_vaca_dia;
  end if;
  if v_ind.producao_dia <> 34.7 then
    raise exception 'FALHOU [indicadores]: producao_dia esperado 34.7, veio %', v_ind.producao_dia;
  end if;
  if v_ind.receita_mensal <> 3000 or v_ind.despesa_mensal <> 2000 then
    raise exception 'FALHOU [indicadores]: médias mensais erradas (receita %, despesa %)',
      v_ind.receita_mensal, v_ind.despesa_mensal;
  end if;
  if v_ind.custo_litro <> 1.92 then
    raise exception 'FALHOU [indicadores]: custo_litro esperado 1.92 (2000 / (34.7 × 30)), veio %', v_ind.custo_litro;
  end if;

  -- fazenda sem nenhum lançamento: indicadores de leite e dinheiro vêm nulos, não zero
  select * into v_ind from calcular_indicadores(v_prop_ind, current_date - 1000);
  if v_ind.litros_vaca_dia is not null or v_ind.custo_litro is not null or v_ind.receita_mensal is not null then
    raise exception 'FALHOU [indicadores]: sem dados no período, leite/dinheiro deveriam ser nulos';
  end if;

  begin
    perform sugerir_linha_base(v_prop_ind, current_date);
    raise exception 'FALHOU [sugerir_linha_base]: deveria exigir gestor';
  exception when others then
    if sqlerrm not ilike '%gestor%' then
      raise exception 'FALHOU [sugerir_linha_base]: erro inesperado: %', sqlerrm;
    end if;
  end;

  insert into gestores (usuario_id) values (v_usuario_id) on conflict do nothing;
  if (select litros_vaca_dia from sugerir_linha_base(v_prop_ind, current_date)) <> 17.33 then
    raise exception 'FALHOU [sugerir_linha_base]: deveria devolver o mesmo cálculo de calcular_indicadores';
  end if;

  insert into adesoes_programa (propriedade_id, data_adesao, litros_vaca_dia)
  values (v_prop_ind, current_date - 1, 12);
  if (select litros_vaca_dia from indicadores_atuais_programa() where propriedade_id = v_prop_ind) <> 17.33 then
    raise exception 'FALHOU [indicadores_atuais_programa]: deveria trazer o valor de hoje da fazenda que aderiu';
  end if;

  -- ============================================================
  -- acesso de técnicos (0023)
  -- ============================================================

  -- o usuário de teste é produtor de v_propriedade_id (papel default); começa sem ser gestor
  delete from gestores where usuario_id = v_usuario_id;

  insert into auth.users (id, email, raw_user_meta_data)
  values (gen_random_uuid(), '__tecnico_teste__@exemplo.invalid', '{"nome": "Técnico Teste"}')
  returning id into v_tecnico_id;

  perform vincular_tecnico(v_propriedade_id, '  __TECNICO_TESTE__@exemplo.invalid ');
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = v_tecnico_id and propriedade_id = v_propriedade_id and papel = 'tecnico'
  ) then
    raise exception 'FALHOU [vincular_tecnico]: produtor deveria vincular pelo e-mail (sem diferenciar maiúscula/espaço)';
  end if;

  begin
    perform vincular_tecnico(v_propriedade_id, '__tecnico_teste__@exemplo.invalid');
    raise exception 'FALHOU [vincular_tecnico]: vínculo repetido deveria ser recusado';
  exception when others then
    if sqlerrm not ilike '%já tem acesso%' then
      raise exception 'FALHOU [vincular_tecnico]: erro inesperado no repetido: %', sqlerrm;
    end if;
  end;

  begin
    perform vincular_tecnico(v_propriedade_id, '__ninguem__@exemplo.invalid');
    raise exception 'FALHOU [vincular_tecnico]: e-mail sem conta deveria ser recusado';
  exception when others then
    if sqlerrm not ilike '%Não existe conta%' then
      raise exception 'FALHOU [vincular_tecnico]: erro inesperado no e-mail sem conta: %', sqlerrm;
    end if;
  end;

  select count(*) into v_qtd from listar_acessos_propriedade(v_propriedade_id);
  if v_qtd <> 2 then
    raise exception 'FALHOU [listar_acessos_propriedade]: esperava 2 acessos (produtor + técnico), veio %', v_qtd;
  end if;
  if (select papel from listar_acessos_propriedade(v_propriedade_id) limit 1) <> 'produtor' then
    raise exception 'FALHOU [listar_acessos_propriedade]: o produtor deveria vir primeiro';
  end if;
  if (select nome from listar_acessos_propriedade(v_propriedade_id) where usuario_id = v_tecnico_id) <> 'Técnico Teste' then
    raise exception 'FALHOU [listar_acessos_propriedade]: nome do técnico deveria vir do metadata';
  end if;

  -- logado como o técnico: enxerga os acessos, mas não concede nem remove
  perform set_config('request.jwt.claim.sub', v_tecnico_id::text, true);

  select count(*) into v_qtd from listar_acessos_propriedade(v_propriedade_id);
  if v_qtd <> 2 then
    raise exception 'FALHOU [listar_acessos_propriedade]: técnico vinculado deveria ver os acessos da fazenda';
  end if;

  begin
    perform desvincular_tecnico(v_propriedade_id, v_tecnico_id);
    raise exception 'FALHOU [desvincular_tecnico]: técnico não deveria remover acesso';
  exception when others then
    if sqlerrm not ilike '%Só o produtor%' then
      raise exception 'FALHOU [desvincular_tecnico]: erro inesperado pro técnico: %', sqlerrm;
    end if;
  end;

  begin
    perform listar_acessos_propriedade(v_prop_ind);
    raise exception 'FALHOU [listar_acessos_propriedade]: técnico sem vínculo não deveria ver outra fazenda';
  exception when others then
    if sqlerrm not ilike '%sem acesso%' then
      raise exception 'FALHOU [listar_acessos_propriedade]: erro inesperado sem vínculo: %', sqlerrm;
    end if;
  end;

  perform set_config('request.jwt.claim.sub', v_usuario_id::text, true);

  -- fazenda onde o usuário não é produtor: só o gestor consegue vincular
  insert into propriedades (nome_propriedade, nome_produtor)
  values ('__teste_rpc_sem_produtor__', '__teste_rpc__')
  returning id into v_prop_sem;

  begin
    perform vincular_tecnico(v_prop_sem, '__tecnico_teste__@exemplo.invalid');
    raise exception 'FALHOU [vincular_tecnico]: sem ser produtor da fazenda nem gestor deveria ser recusado';
  exception when others then
    if sqlerrm not ilike '%Só o produtor%' then
      raise exception 'FALHOU [vincular_tecnico]: erro inesperado sem permissão: %', sqlerrm;
    end if;
  end;

  insert into gestores (usuario_id) values (v_usuario_id);
  perform vincular_tecnico(v_prop_sem, '__tecnico_teste__@exemplo.invalid');
  if not exists (
    select 1 from acessos_todas_fazendas()
    where propriedade_id = v_prop_sem and usuario_id = v_tecnico_id and papel = 'tecnico'
  ) then
    raise exception 'FALHOU [acessos_todas_fazendas]: gestor deveria vincular e ver o técnico em qualquer fazenda';
  end if;

  perform desvincular_tecnico(v_prop_sem, v_tecnico_id);
  if exists (select 1 from usuarios_propriedades where usuario_id = v_tecnico_id and propriedade_id = v_prop_sem) then
    raise exception 'FALHOU [desvincular_tecnico]: vínculo deveria ter sido removido';
  end if;

  begin
    perform desvincular_tecnico(v_propriedade_id, v_usuario_id);
    raise exception 'FALHOU [desvincular_tecnico]: não deveria remover vínculo de produtor';
  exception when others then
    if sqlerrm not ilike '%não tem acesso%' then
      raise exception 'FALHOU [desvincular_tecnico]: erro inesperado ao tentar remover produtor: %', sqlerrm;
    end if;
  end;
  if not exists (select 1 from usuarios_propriedades where usuario_id = v_usuario_id and propriedade_id = v_propriedade_id) then
    raise exception 'FALHOU [desvincular_tecnico]: vínculo de produtor foi apagado';
  end if;

  -- ============================================================
  -- telefone normalizado e identificação pelo bot (0024)
  -- ============================================================

  if _telefone_normalizado('(85) 99814-9317') <> '5585998149317'
     or _telefone_normalizado('558598149317@s.whatsapp.net') <> '558598149317' then
    raise exception 'FALHOU [_telefone_normalizado]: deveria deixar só dígitos com 55';
  end if;
  if _telefone_chave('(85) 99814-9317') <> _telefone_chave('558598149317@s.whatsapp.net') then
    raise exception 'FALHOU [_telefone_chave]: com e sem o nono dígito deveriam ser o mesmo número';
  end if;

  insert into usuarios_whatsapp (propriedade_id, telefone) values (v_propriedade_id, '(99) 9 0000-0001');
  if not exists (select 1 from usuarios_whatsapp where telefone = '5599900000001') then
    raise exception 'FALHOU [usuarios_whatsapp]: telefone deveria ser gravado normalizado';
  end if;

  if (bot_identificar_usuario('559900000001@s.whatsapp.net')->>'propriedade_id')::uuid is distinct from v_propriedade_id then
    raise exception 'FALHOU [bot_identificar_usuario]: deveria achar o número sem o nono dígito do WhatsApp';
  end if;
  if _propriedade_do_telefone('559900000001@s.whatsapp.net') is distinct from v_propriedade_id then
    raise exception 'FALHOU [_propriedade_do_telefone]: deveria achar o número sem o nono dígito do WhatsApp';
  end if;
  if bot_identificar_usuario('550000000000@s.whatsapp.net') <> '{}'::jsonb then
    raise exception 'FALHOU [bot_identificar_usuario]: número desconhecido deveria devolver {}';
  end if;

  begin
    insert into usuarios_whatsapp (propriedade_id, telefone) values (v_prop_ind, '99 90000-0001');
    raise exception 'FALHOU [usuarios_whatsapp]: o mesmo número escrito de outro jeito deveria ser recusado';
  exception when others then
    if sqlerrm not ilike '%já está cadastrado%' then
      raise exception 'FALHOU [usuarios_whatsapp]: erro inesperado no duplicado: %', sqlerrm;
    end if;
  end;

  begin
    insert into usuarios_whatsapp (propriedade_id, telefone) values (v_prop_ind, '9999-0001');
    raise exception 'FALHOU [usuarios_whatsapp]: número sem DDD deveria ser recusado';
  exception when others then
    if sqlerrm not ilike '%inválido%' then
      raise exception 'FALHOU [usuarios_whatsapp]: erro inesperado no número sem DDD: %', sqlerrm;
    end if;
  end;

  -- ============================================================
  -- status reprodutivo derivado das coberturas (0024)
  -- ============================================================

  insert into vacas (propriedade_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (v_propriedade_id, 90001, 'novilha', 'vazia')
  returning id into v_vaca_status;

  insert into coberturas (vaca_id, data_cobertura) values (v_vaca_status, current_date - 40)
  returning id into v_cob_status;
  if (select status_reprodutivo from vacas where id = v_vaca_status) <> 'vazia_em_servico' then
    raise exception 'FALHOU [status_reprodutivo]: cobertura pendente deveria deixar a vaca em serviço';
  end if;

  update coberturas set diagnostico_prenhez = 'positivo' where id = v_cob_status;
  if (select status_reprodutivo from vacas where id = v_vaca_status) <> 'prenhe' then
    raise exception 'FALHOU [status_reprodutivo]: diagnóstico positivo deveria deixar a vaca prenhe';
  end if;

  -- parto ativo depois da cobertura: a cobertura antiga não conta mais
  insert into partos (vaca_id, data_parto, ativa) values (v_vaca_status, current_date - 5, true);
  insert into coberturas (vaca_id, data_cobertura) values (v_vaca_status, current_date - 1)
  returning id into v_cob_status;
  if (select status_reprodutivo from vacas where id = v_vaca_status) <> 'vazia_em_servico' then
    raise exception 'FALHOU [status_reprodutivo]: cobertura nova depois do parto deveria deixar em serviço';
  end if;

  update coberturas set diagnostico_prenhez = 'negativo' where id = v_cob_status;
  if (select status_reprodutivo from vacas where id = v_vaca_status) <> 'vazia' then
    raise exception 'FALHOU [status_reprodutivo]: diagnóstico negativo deveria deixar a vaca vazia';
  end if;

  update coberturas set diagnostico_prenhez = 'positivo' where id = v_cob_status;
  delete from coberturas where id = v_cob_status;
  if (select status_reprodutivo from vacas where id = v_vaca_status) <> 'vazia' then
    raise exception 'FALHOU [status_reprodutivo]: sem cobertura na lactação atual deveria voltar pra vazia (a anterior ao parto não conta)';
  end if;

  -- ============================================================
  -- bot: leite, diagnóstico, vacas e financeiro pelo banco (0025)
  -- ============================================================

  if _fmt_reais(1234.5) <> 'R$ 1.234,50' or _fmt_num(12.0) <> '12' or _fmt_num(12.5) <> '12,5' then
    raise exception 'FALHOU [formatação]: veio % / % / %', _fmt_reais(1234.5), _fmt_num(12.0), _fmt_num(12.5);
  end if;

  insert into vacas (propriedade_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (v_propriedade_id, 90002, 'lactacao', 'vazia')
  returning id into v_vaca_bot;
  insert into partos (vaca_id, data_parto, ativa) values (v_vaca_bot, _hoje_fazenda() - 10, true);

  v_bot := bot_registrar_leite('5500000000001@s.whatsapp.net', 90002, 12.5, _hoje_fazenda(), 'manhã');
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%12,5 L%manhã%' then
    raise exception 'FALHOU [bot_registrar_leite]: deveria registrar com o período (veio %)', v_bot;
  end if;

  v_bot := bot_registrar_leite('5500000000001', 90002, 10, _hoje_fazenda(), 'manha');
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%já existe lançamento%' then
    raise exception 'FALHOU [bot_registrar_leite]: mesma ordenha no mesmo dia deveria ser recusada (veio %)', v_bot;
  end if;

  v_bot := bot_registrar_leite('5500000000001', 90002, 8, _hoje_fazenda(), 'tarde');
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%Total da vaca no dia: 20,5 L%' then
    raise exception 'FALHOU [bot_registrar_leite]: segunda ordenha deveria somar o total do dia (veio %)', v_bot;
  end if;

  v_bot := bot_registrar_leite('5500000000001', 90002, 8, _hoje_fazenda() + 2, null);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%ainda não chegou%' then
    raise exception 'FALHOU [bot_registrar_leite]: data futura deveria ser recusada (veio %)', v_bot;
  end if;

  v_bot := bot_registrar_leite('5500000000001', 90002, 8, _hoje_fazenda() - 20, null);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%anterior ao parto%' then
    raise exception 'FALHOU [bot_registrar_leite]: data antes do parto deveria ser recusada (veio %)', v_bot;
  end if;

  v_bot := bot_registrar_leite('5500000000001', 90002, null, _hoje_fazenda(), null);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%quantos litros%' then
    raise exception 'FALHOU [bot_registrar_leite]: sem litros deveria perguntar (veio %)', v_bot;
  end if;

  v_bot := bot_corrigir_leite('5500000000001', 90002, _hoje_fazenda(), null, 9);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%2 lançamentos%' then
    raise exception 'FALHOU [bot_corrigir_leite]: duas ordenhas sem período deveria perguntar qual (veio %)', v_bot;
  end if;

  v_bot := bot_corrigir_leite('5500000000001', 90002, _hoje_fazenda(), 'tarde', 9);
  if not (v_bot->>'ok')::boolean
     or (select litros from controle_leite where vaca_id = v_vaca_bot and periodo = 'tarde') <> 9
     or (select litros from controle_leite where vaca_id = v_vaca_bot and periodo = 'manha') <> 12.5 then
    raise exception 'FALHOU [bot_corrigir_leite]: deveria corrigir só a ordenha da tarde (veio %)', v_bot;
  end if;

  v_alvo_bot := bot_localizar_leite_exclusao('5500000000001', 90002, _hoje_fazenda(), 'manha');
  if not (v_alvo_bot->>'ok')::boolean or v_alvo_bot->>'mensagem' not ilike 'Confirma excluir%' then
    raise exception 'FALHOU [bot_localizar_leite_exclusao]: deveria achar a ordenha da manhã (veio %)', v_alvo_bot;
  end if;
  if not exists (select 1 from controle_leite where id = (v_alvo_bot->>'registro_id')::uuid) then
    raise exception 'FALHOU [bot_localizar_leite_exclusao]: não pode apagar nada antes da confirmação';
  end if;

  v_bot := bot_excluir_leite('5599999999999', (v_alvo_bot->>'registro_id')::uuid);
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot_excluir_leite]: telefone de fora da fazenda não pode apagar';
  end if;

  v_bot := bot_excluir_leite('5500000000001', (v_alvo_bot->>'registro_id')::uuid);
  if not (v_bot->>'ok')::boolean or exists (select 1 from controle_leite where id = (v_alvo_bot->>'registro_id')::uuid) then
    raise exception 'FALHOU [bot_excluir_leite]: deveria apagar depois da confirmação (veio %)', v_bot;
  end if;
  v_bot := bot_excluir_leite('5500000000001', (v_alvo_bot->>'registro_id')::uuid);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%não existe mais%' then
    raise exception 'FALHOU [bot_excluir_leite]: apagar de novo deveria avisar (veio %)', v_bot;
  end if;

  -- site: registrar_leite passa a gravar o período
  perform registrar_leite(v_vaca_bot, 15, _hoje_fazenda() - 1, 'dia_inteiro');
  if not exists (select 1 from controle_leite where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 1 and periodo = 'dia_inteiro') then
    raise exception 'FALHOU [registrar_leite]: deveria gravar o período';
  end if;

  v_bot := bot_diagnosticar_prenhez('5500000000001', 90002, 'positivo');
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%não tem cobertura%' then
    raise exception 'FALHOU [bot_diagnosticar_prenhez]: sem cobertura deveria avisar (veio %)', v_bot;
  end if;

  insert into coberturas (vaca_id, data_cobertura) values (v_vaca_bot, _hoje_fazenda() - 3);
  v_bot := bot_diagnosticar_prenhez('5500000000001', 90002, 'talvez');
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot_diagnosticar_prenhez]: resultado inválido deveria ser recusado';
  end if;

  v_bot := bot_diagnosticar_prenhez('5500000000001', 90002, 'positivo');
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%Parto previsto%'
     or (select status_reprodutivo from vacas where id = v_vaca_bot) <> 'prenhe' then
    raise exception 'FALHOU [bot_diagnosticar_prenhez]: positivo deveria deixar a vaca prenhe e prever o parto (veio %)', v_bot;
  end if;

  -- cadastro: número automático considera os bezerros (antes o bot olhava só as vacas)
  insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
  values (v_propriedade_id, v_vaca_bot, 90010, 'femea', _hoje_fazenda() - 10);

  v_bot := bot_cadastrar_vaca('5500000000001', null, null, null, null, null);
  v_num_auto := (v_bot->>'numero')::integer;
  if not (v_bot->>'ok')::boolean or v_num_auto <= 90010 then
    raise exception 'FALHOU [bot_cadastrar_vaca]: número automático deveria passar do maior bezerro (veio %)', v_bot;
  end if;

  v_bot := bot_cadastrar_vaca('5500000000001', 90002, null, null, null, null);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%já está cadastrada%' then
    raise exception 'FALHOU [bot_cadastrar_vaca]: número repetido deveria avisar (veio %)', v_bot;
  end if;

  v_bot := bot_cadastrar_vaca('5500000000001', 90010, 90002, 'nascida', null, null);
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%vinculada ao registro de nascimento%'
     or (select vaca_id_gerada from bezerros where propriedade_id = v_propriedade_id and numero_identificacao = 90010) is null then
    raise exception 'FALHOU [bot_cadastrar_vaca]: filha deveria ser vinculada ao bezerro (veio %)', v_bot;
  end if;

  v_bot := bot_cadastrar_vaca('5500000000001', 90020, 90002, 'comprada', null, null);
  if not (v_bot->>'ok')::boolean
     or (select mae_id from vacas where propriedade_id = v_propriedade_id and numero_identificacao = 90020) is not null then
    raise exception 'FALHOU [bot_cadastrar_vaca]: vaca comprada não deveria ganhar mãe (veio %)', v_bot;
  end if;

  v_bot := bot_atualizar_vaca('5500000000001', 90020, 'seca', null);
  if not (v_bot->>'ok')::boolean
     or (select status_produtivo from vacas where propriedade_id = v_propriedade_id and numero_identificacao = 90020) <> 'seca' then
    raise exception 'FALHOU [bot_atualizar_vaca]: deveria marcar seca (veio %)', v_bot;
  end if;
  v_bot := bot_atualizar_vaca('5500000000001', 90020, null, null);
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot_atualizar_vaca]: sem nada pra mudar deveria perguntar';
  end if;

  -- financeiro
  v_bot := bot_registrar_financeiro('5500000000001', 'despesa', 200, '  Ração ', null);
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%R$ 200,00%'
     or not exists (select 1 from financeiro where propriedade_id = v_propriedade_id and categoria = 'racao' and valor = 200) then
    raise exception 'FALHOU [bot_registrar_financeiro]: deveria gravar com categoria normalizada (veio %)', v_bot;
  end if;

  v_bot := bot_registrar_financeiro('5500000000001', 'talvez', 200, 'racao', null);
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot_registrar_financeiro]: tipo inválido deveria ser recusado';
  end if;

  v_bot := bot_corrigir_financeiro('5500000000001', null, null, null, 250);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%categoria ou a data%' then
    raise exception 'FALHOU [bot_corrigir_financeiro]: sem categoria nem data deveria perguntar (veio %)', v_bot;
  end if;

  v_bot := bot_corrigir_financeiro('5500000000001', 'despesa', 'RAÇÃO', null, 250);
  if not (v_bot->>'ok')::boolean
     or not exists (select 1 from financeiro where propriedade_id = v_propriedade_id and categoria = 'racao' and valor = 250) then
    raise exception 'FALHOU [bot_corrigir_financeiro]: deveria corrigir o valor (veio %)', v_bot;
  end if;

  v_alvo_bot := bot_localizar_financeiro_exclusao('5500000000001', 'despesa', 'racao', _hoje_fazenda());
  if not (v_alvo_bot->>'ok')::boolean or v_alvo_bot->>'mensagem' not ilike 'Confirma excluir%' then
    raise exception 'FALHOU [bot_localizar_financeiro_exclusao]: deveria achar o lançamento (veio %)', v_alvo_bot;
  end if;

  v_bot := bot_excluir_financeiro('5500000000001', (v_alvo_bot->>'lancamento_id')::uuid);
  if not (v_bot->>'ok')::boolean or exists (select 1 from financeiro where id = (v_alvo_bot->>'lancamento_id')::uuid) then
    raise exception 'FALHOU [bot_excluir_financeiro]: deveria apagar depois da confirmação (veio %)', v_bot;
  end if;

  -- ============================================================
  -- pesagem do dia (0026)
  -- ============================================================

  v_bot := registrar_pesagem(v_propriedade_id, _hoje_fazenda() - 2, 'manha', jsonb_build_array(
    jsonb_build_object('vaca_id', v_vaca_bot, 'litros', 11),
    jsonb_build_object('vaca_id', gen_random_uuid(), 'litros', 5),
    jsonb_build_object('vaca_id', v_vaca_bot, 'litros', '')
  ));
  if (v_bot->>'salvos')::integer <> 1 or jsonb_array_length(v_bot->'erros') <> 1 then
    raise exception 'FALHOU [registrar_pesagem]: deveria salvar 1 e acusar a vaca de fora (veio %)', v_bot;
  end if;

  v_bot := registrar_pesagem(v_propriedade_id, _hoje_fazenda() - 2, 'manha',
    jsonb_build_array(jsonb_build_object('vaca_id', v_vaca_bot, 'litros', 13)));
  if (v_bot->>'corrigidos')::integer <> 1
     or (select litros from controle_leite where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 2 and periodo = 'manha') <> 13 then
    raise exception 'FALHOU [registrar_pesagem]: mesma ordenha deveria corrigir o valor (veio %)', v_bot;
  end if;

  v_bot := registrar_pesagem(v_propriedade_id, _hoje_fazenda() - 2, 'tarde',
    jsonb_build_array(jsonb_build_object('vaca_id', v_vaca_bot, 'litros', 500)));
  if jsonb_array_length(v_bot->'erros') <> 1 or (v_bot->'erros'->0->>'numero')::integer <> 90002 then
    raise exception 'FALHOU [registrar_pesagem]: litros absurdos deveriam voltar como erro da vaca (veio %)', v_bot;
  end if;

  begin
    perform registrar_pesagem(v_propriedade_id, _hoje_fazenda(), null, '[]'::jsonb);
    raise exception 'FALHOU [registrar_pesagem]: sem ordenha deveria ser recusada';
  exception when others then
    if sqlerrm not ilike '%escolha a ordenha%' then
      raise exception 'FALHOU [registrar_pesagem]: erro inesperado sem ordenha: %', sqlerrm;
    end if;
  end;

  -- ============================================================
  -- relatórios do bot no banco (0027)
  -- vaca 90002: parto há 10 dias; leite por dia = 9 (hoje), 15 (ontem), 13 (anteontem);
  -- cobertura positiva há 3 dias
  -- ============================================================

  v_alvo_bot := _indicadores_lactacao((select id from partos where vaca_id = v_vaca_bot and ativa));
  if round((v_alvo_bot->>'media')::numeric, 2) <> 12.33 or (v_alvo_bot->>'dias_pesados')::integer <> 3
     or (v_alvo_bot->>'dias_em_aberto')::integer <> 7 or not (v_alvo_bot->>'aberto_fechado')::boolean then
    raise exception 'FALHOU [_indicadores_lactacao]: média dos dias pesados / dias em aberto errados (veio %)', v_alvo_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_vaca', '{"numero_vaca": "90002", "tipo_relatorio": "reprodutivo"}', '', false);
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%Vaca 90002%reprodução%'
     or v_bot->>'mensagem' not ilike '%Parto previsto%' or v_bot->>'mensagem' not ilike '%12,3 L/dia%' then
    raise exception 'FALHOU [bot_consultar]: relatório reprodutivo da vaca (veio %)', v_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_vaca', '{"numero_vaca": "90002", "tipo_relatorio": "geral"}', '', false);
  if v_bot->>'mensagem' not ilike '%— reprodução%' or v_bot->>'mensagem' not ilike '%— leite%' then
    raise exception 'FALHOU [bot_consultar]: "geral" de uma vaca deveria juntar leite e reprodução (veio %)', v_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_vaca', '{"numero_vaca": "99999"}', '', false);
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%não encontrei a vaca 99999%' then
    raise exception 'FALHOU [bot_consultar]: vaca inexistente (veio %)', v_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_relatorio', '{"tipo_relatorio": "reprodutivo"}', '', false);
  if v_bot->>'mensagem' not ilike '%Reprodução do rebanho%' or v_bot->>'mensagem' not ilike '%Vaca 90002: parto em%' then
    raise exception 'FALHOU [bot_consultar]: reprodução do rebanho (veio %)', v_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_relatorio', '{"tipo_relatorio": "reprodutivo"}', '', true);
  if v_bot->>'mensagem' not ilike 'Você tem%' or v_bot->>'mensagem' like '%*%' then
    raise exception 'FALHOU [bot_consultar]: versão em áudio deveria ser texto corrido (veio %)', v_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_relatorio', '{"tipo_relatorio": "cadastro"}', '', false);
  if v_bot->>'mensagem' not ilike '%Rebanho%vacas%' then
    raise exception 'FALHOU [bot_consultar]: censo (veio %)', v_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_relatorio', '{"tipo_relatorio": "leite"}', 'quanto deu de leite hoje', false);
  if v_bot->>'mensagem' not ilike 'Produção de hoje%' then
    raise exception 'FALHOU [bot_consultar]: produção de hoje (veio %)', v_bot;
  end if;

  v_bot := bot_consultar('5500000000001', 'consultar_relatorio', '{}', 'como está a produção', false);
  if v_bot->>'mensagem' not ilike '%Produção — mês atual e mês passado%' then
    raise exception 'FALHOU [bot_consultar]: produção no período padrão (veio %)', v_bot;
  end if;

  insert into financeiro (propriedade_id, tipo, categoria, valor, data)
  values (v_propriedade_id, 'receita', 'venda de leite', 300, _hoje_fazenda());
  v_bot := bot_consultar('5500000000001', 'consultar_financeiro', '{}', 'relatorio financeiro', false);
  if v_bot->>'mensagem' not ilike '%Receitas: R$ 300,00%' or v_bot->>'mensagem' not ilike '%receita - venda de leite%' then
    raise exception 'FALHOU [bot_consultar]: financeiro (veio %)', v_bot;
  end if;

  -- ============================================================
  -- alertas reprodutivos do gestor (0028)
  -- ============================================================

  -- novilha (sem parto): a pendente de 50 dias é a cobertura atual dela. Na 90001 não serviria —
  -- ela pariu há 5 dias e cobertura de antes do parto já não conta (0038).
  insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
  values (v_propriedade_id, 90950, 'novilha') returning id into v_cob_status;
  insert into coberturas (vaca_id, data_cobertura) values (v_cob_status, _hoje_fazenda() - 50);
  if not exists (
    select 1 from alertas_reprodutivos()
    where propriedade_id = v_propriedade_id and tipo = 'diagnostico_atrasado' and numero = 90950 and dias = 50
  ) then
    raise exception 'FALHOU [alertas_reprodutivos]: cobertura pendente há 50 dias deveria alertar';
  end if;
  if exists (
    select 1 from alertas_reprodutivos() where propriedade_id = v_propriedade_id and numero = 90002
  ) then
    raise exception 'FALHOU [alertas_reprodutivos]: vaca 90002 (prenhe há 3 dias) não deveria alertar';
  end if;

  -- ============================================================
  -- bezerra vira vaca (0029)
  -- ============================================================

  insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
  values (v_propriedade_id, v_vaca_bot, 90030, 'femea', _hoje_fazenda() - 400)
  returning id into v_cob_status;

  perform promover_bezerro(v_cob_status);
  if not exists (
    select 1 from vacas v join bezerros b on b.vaca_id_gerada = v.id
    where b.id = v_cob_status and v.numero_identificacao = 90030 and v.mae_id = v_vaca_bot and v.status_produtivo = 'novilha'
  ) then
    raise exception 'FALHOU [promover_bezerro]: deveria criar a novilha 90030 ligada à bezerra e à mãe';
  end if;

  begin
    perform promover_bezerro(v_cob_status);
    raise exception 'FALHOU [promover_bezerro]: promover de novo deveria ser recusado';
  exception when others then
    if sqlerrm not ilike '%já foi cadastrado como vaca%' then
      raise exception 'FALHOU [promover_bezerro]: erro inesperado ao repetir: %', sqlerrm;
    end if;
  end;

  insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
  values (v_propriedade_id, v_vaca_bot, 90031, 'macho', _hoje_fazenda() - 400)
  returning id into v_cob_status;
  begin
    perform promover_bezerro(v_cob_status);
    raise exception 'FALHOU [promover_bezerro]: macho não deveria virar vaca';
  exception when others then
    if sqlerrm not ilike '%só bezerras%' then
      raise exception 'FALHOU [promover_bezerro]: erro inesperado com macho: %', sqlerrm;
    end if;
  end;

  -- ============================================================
  -- autoria (0030)
  -- ============================================================

  perform registrar_leite(v_vaca_bot, 7, _hoje_fazenda() - 4, 'manha');
  if not exists (
    select 1 from controle_leite
    where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 4
      and criado_por = v_usuario_id and criado_via = 'site'
  ) then
    raise exception 'FALHOU [autoria]: lançamento pelo site deveria guardar o usuário e a origem';
  end if;

  -- o bot roda com a service role, sem usuário logado
  perform set_config('request.jwt.claim.sub', '', true);
  v_bot := bot_registrar_leite('5500000000001', 90002, 6, _hoje_fazenda() - 4, 'tarde');
  perform set_config('request.jwt.claim.sub', v_usuario_id::text, true);
  if not exists (
    select 1 from controle_leite
    where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 4 and periodo = 'tarde'
      and criado_por is null and criado_via = 'whatsapp'
  ) then
    raise exception 'FALHOU [autoria]: lançamento pelo bot deveria ficar como whatsapp (veio %)', v_bot;
  end if;

  update controle_leite set litros = 8
  where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 4 and periodo = 'tarde';
  if not exists (
    select 1 from controle_leite
    where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 4 and periodo = 'tarde'
      and criado_via = 'whatsapp' and atualizado_por = v_usuario_id and atualizado_em is not null
  ) then
    raise exception 'FALHOU [autoria]: correção deveria guardar quem alterou sem mudar quem criou';
  end if;

  -- arquivamento da lactação leva período e autoria pro histórico
  insert into controle_leite_historico (id, vaca_id, parto_id, litros, data_controle, created_at)
  select id, vaca_id, parto_id, litros, data_controle, created_at
  from controle_leite where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 4;
  if (select count(*) from controle_leite_historico
      where vaca_id = v_vaca_bot and data_controle = _hoje_fazenda() - 4 and periodo is not null and criado_via is not null) <> 2 then
    raise exception 'FALHOU [autoria]: histórico deveria receber período e autoria do lançamento';
  end if;

  -- ============================================================
  -- lembretes diários (0031) — a novilha 90950 tem cobertura pendente há 50 dias (teste de 0028)
  -- ============================================================

  if exists (select 1 from lembretes_do_dia() where propriedade_id = v_propriedade_id) then
    raise exception 'FALHOU [lembretes_do_dia]: fazenda com lembrete desligado não deveria receber';
  end if;

  update propriedades set lembretes_whatsapp = true where id = v_propriedade_id;
  if not exists (
    select 1 from lembretes_do_dia()
    where propriedade_id = v_propriedade_id
      and mensagem ilike '%Diagnóstico de prenhez: vaca 90950 (coberta há 50 dias)%'
  ) then
    raise exception 'FALHOU [lembretes_do_dia]: deveria lembrar do diagnóstico pendente (veio %)',
      (select mensagem from lembretes_do_dia() where propriedade_id = v_propriedade_id);
  end if;

  perform marcar_lembrete_enviado(v_propriedade_id);
  if exists (select 1 from lembretes_do_dia() where propriedade_id = v_propriedade_id) then
    raise exception 'FALHOU [lembretes_do_dia]: não deveria mandar duas vezes no mesmo dia';
  end if;

  -- ============================================================
  -- visitas técnicas (0032)
  -- ============================================================

  v_cob_status := (registrar_visita(v_propriedade_id, _hoje_fazenda(), 'Pasto bem manejado.',
    array['Fazer diagnóstico da vaca 90001', '  ', 'Ajustar sal mineral'])).id;
  if (select count(*) from recomendacoes where visita_id = v_cob_status) <> 2
     or (select autor_id from visitas where id = v_cob_status) <> v_usuario_id then
    raise exception 'FALHOU [registrar_visita]: deveria gravar a visita com 2 recomendações (ignorando a vazia) e o autor';
  end if;

  perform concluir_recomendacao((select id from recomendacoes where visita_id = v_cob_status and texto like 'Ajustar%'), true);
  if (select count(*) from recomendacoes where visita_id = v_cob_status and concluida_em is not null) <> 1 then
    raise exception 'FALHOU [concluir_recomendacao]: deveria marcar como feita';
  end if;

  begin
    perform registrar_visita(v_propriedade_id, _hoje_fazenda(), '  ', array['', ' ']);
    raise exception 'FALHOU [registrar_visita]: visita vazia deveria ser recusada';
  exception when others then
    if sqlerrm not ilike '%escreva as observações%' then
      raise exception 'FALHOU [registrar_visita]: erro inesperado na visita vazia: %', sqlerrm;
    end if;
  end;

  -- outro usuário (o técnico) não exclui a visita de quem registrou
  perform set_config('request.jwt.claim.sub', v_tecnico_id::text, true);
  begin
    perform excluir_visita(v_cob_status);
    raise exception 'FALHOU [excluir_visita]: só o autor deveria excluir';
  exception when others then
    if sqlerrm not ilike '%só quem registrou%' then
      raise exception 'FALHOU [excluir_visita]: erro inesperado: %', sqlerrm;
    end if;
  end;
  perform set_config('request.jwt.claim.sub', v_usuario_id::text, true);

  perform excluir_visita(v_cob_status);
  if exists (select 1 from recomendacoes where visita_id = v_cob_status) then
    raise exception 'FALHOU [excluir_visita]: deveria apagar a visita e as recomendações';
  end if;

  -- ============================================================
  -- lançamentos do campo sem internet (0035) — reenvio não duplica
  -- ============================================================

  v_qtd := (select count(*) from coberturas where vaca_id = v_vaca_bot);
  v_cob_status := gen_random_uuid();
  v_bot := registrar_lancamento_campo(v_cob_status, v_propriedade_id, 'cobertura',
    jsonb_build_object('vaca_id', v_vaca_bot, 'data', _hoje_fazenda() - 1, 'touro_texto', 'Touro Campo'));
  if not (v_bot->>'ok')::boolean or (select count(*) from coberturas where vaca_id = v_vaca_bot) <> v_qtd + 1 then
    raise exception 'FALHOU [registrar_lancamento_campo]: cobertura deveria ser registrada (veio %)', v_bot;
  end if;

  v_bot := registrar_lancamento_campo(v_cob_status, v_propriedade_id, 'cobertura',
    jsonb_build_object('vaca_id', v_vaca_bot, 'data', _hoje_fazenda() - 1, 'touro_texto', 'Touro Campo'));
  if not (v_bot->>'repetido')::boolean or (select count(*) from coberturas where vaca_id = v_vaca_bot) <> v_qtd + 1 then
    raise exception 'FALHOU [registrar_lancamento_campo]: reenvio do mesmo lançamento não pode duplicar (veio %)', v_bot;
  end if;

  v_bot := registrar_lancamento_campo(gen_random_uuid(), v_propriedade_id, 'diagnostico',
    jsonb_build_object('vaca_id', v_vaca_bot, 'resultado', 'positivo'));
  if not (v_bot->>'ok')::boolean
     or (select diagnostico_prenhez from coberturas where vaca_id = v_vaca_bot and touro_semen = 'Touro Campo') <> 'positivo' then
    raise exception 'FALHOU [registrar_lancamento_campo]: diagnóstico deveria ir na cobertura mais recente (veio %)', v_bot;
  end if;

  v_bot := registrar_lancamento_campo(gen_random_uuid(), v_propriedade_id, 'parto',
    jsonb_build_object('vaca_id', (select id from vacas where propriedade_id = v_propriedade_id and numero_identificacao = 90020),
                       'data', _hoje_fazenda(), 'sexo_bezerro', 'femea'));
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike 'Parto da vaca 90020%' then
    raise exception 'FALHOU [registrar_lancamento_campo]: parto deveria ser registrado (veio %)', v_bot;
  end if;

  v_bot := registrar_lancamento_campo(gen_random_uuid(), v_propriedade_id, 'cobertura',
    jsonb_build_object('vaca_id', v_vaca_bot, 'data', _hoje_fazenda() + 3));
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%data da cobertura inválida%' then
    raise exception 'FALHOU [registrar_lancamento_campo]: data futura deveria voltar como recusa (veio %)', v_bot;
  end if;

  v_bot := registrar_lancamento_campo(gen_random_uuid(), v_propriedade_id, 'cobertura',
    jsonb_build_object('vaca_id', gen_random_uuid(), 'data', _hoje_fazenda()));
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [registrar_lancamento_campo]: vaca de outra fazenda deveria ser recusada';
  end if;

  -- ============================================================
  -- WhatsApp: doses, lembretes e bezerra que vira vaca (0036)
  -- ============================================================

  insert into touros (nome, codigo) values ('Touro Ação', 'TA-01') returning id into v_cob_status;
  insert into entregas_doses (propriedade_id, touro_id, quantidade, data_entrega)
  values (v_propriedade_id, v_cob_status, 5, _hoje_fazenda() - 2);

  v_bot := bot_consultar('5500000000001', 'consultar_relatorio', '{"tipo_relatorio": "doses"}', 'quantas doses eu tenho', false);
  if v_bot->>'mensagem' not ilike '%Aguardando você confirmar%Touro Ação%' then
    raise exception 'FALHOU [bot_consultar doses]: deveria mostrar a entrega pendente (veio %)', v_bot;
  end if;

  v_bot := bot_acao('5500000000001', 'confirmar_doses', '{"touro_semen": "touro acao"}');
  if not (v_bot->>'ok')::boolean
     or exists (select 1 from entregas_doses where touro_id = v_cob_status and recebido_em is null) then
    raise exception 'FALHOU [bot_acao confirmar_doses]: deveria confirmar a entrega do touro falado (veio %)', v_bot;
  end if;
  v_bot := bot_acao('5500000000001', 'confirmar_doses', '{"touro_semen": "touro acao"}');
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot_acao confirmar_doses]: não há mais o que confirmar (veio %)', v_bot;
  end if;

  perform bot_acao('5500000000001', 'desligar_lembretes', '{}');
  if (select lembretes_whatsapp from propriedades where id = v_propriedade_id) then
    raise exception 'FALHOU [bot_acao]: desligar_lembretes deveria desligar';
  end if;
  perform bot_acao('5500000000001', 'ligar_lembretes', '{}');
  if not (select lembretes_whatsapp from propriedades where id = v_propriedade_id) then
    raise exception 'FALHOU [bot_acao]: ligar_lembretes deveria ligar';
  end if;

  insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
  values (v_propriedade_id, v_vaca_bot, 90040, 'femea', _hoje_fazenda() - 500);
  v_bot := bot_acao('5500000000001', 'promover_bezerro', '{"numero_bezerro": "90040"}');
  if not (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike 'Bezerra 90040 cadastrada como vaca%filha da vaca 90002%' then
    raise exception 'FALHOU [bot_acao promover_bezerro]: deveria cadastrar a bezerra como vaca (veio %)', v_bot;
  end if;
  v_bot := bot_acao('5500000000001', 'promover_bezerro', '{"numero_bezerro": "90031"}');
  if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%só bezerras%' then
    raise exception 'FALHOU [bot_acao promover_bezerro]: macho deveria ser recusado (veio %)', v_bot;
  end if;

  v_bot := bot_acao('5500000000001', 'voar', '{}');
  if (v_bot->>'ok')::boolean then
    raise exception 'FALHOU [bot_acao]: ação desconhecida deveria ser recusada';
  end if;

  -- ============================================================
  -- gestores pela tela (0037) — o usuário de teste é gestor desde a seção de técnicos
  -- ============================================================

  delete from gestores where usuario_id <> v_usuario_id;
  begin
    perform remover_gestor(v_usuario_id);
    raise exception 'FALHOU [remover_gestor]: não pode deixar o programa sem gestor';
  exception when others then
    if sqlerrm not ilike '%pelo menos um gestor%' then
      raise exception 'FALHOU [remover_gestor]: erro inesperado: %', sqlerrm;
    end if;
  end;

  perform adicionar_gestor('  __TECNICO_TESTE__@exemplo.invalid ');
  if (select count(*) from listar_gestores()) <> 2 then
    raise exception 'FALHOU [adicionar_gestor]: deveria virar 2 gestores';
  end if;
  begin
    perform adicionar_gestor('__ninguem__@exemplo.invalid');
    raise exception 'FALHOU [adicionar_gestor]: e-mail sem conta deveria ser recusado';
  exception when others then
    if sqlerrm not ilike '%Não existe conta%' then
      raise exception 'FALHOU [adicionar_gestor]: erro inesperado: %', sqlerrm;
    end if;
  end;

  -- quem não é gestor não mexe
  perform set_config('request.jwt.claim.sub', (select id::text from auth.users where email = '__tecnico_teste__@exemplo.invalid'), true);
  perform remover_gestor(v_usuario_id);
  perform set_config('request.jwt.claim.sub', v_usuario_id::text, true);
  begin
    perform listar_gestores();
    raise exception 'FALHOU [listar_gestores]: quem deixou de ser gestor não deveria ver';
  exception when others then
    if sqlerrm not ilike '%Só o gestor%' then
      raise exception 'FALHOU [listar_gestores]: erro inesperado: %', sqlerrm;
    end if;
  end;

  -- ============================================================
  -- cobertura atual (0038): positiva de antes do parto ativo e pendente repetida não contam
  -- ============================================================

  declare
    v_vaca_velha uuid;
    v_vaca_dupla uuid;
  begin
    insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
    values (v_propriedade_id, 90901, 'lactacao') returning id into v_vaca_velha;
    -- positiva solta de 300 dias atrás (gestação que já terminou) e parto ativo depois dela
    insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez)
    values (v_vaca_velha, _hoje_fazenda() - 300, 'positivo');
    insert into partos (vaca_id, data_parto, ativa) values (v_vaca_velha, _hoje_fazenda() - 20, true);

    insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
    values (v_propriedade_id, 90902, 'novilha') returning id into v_vaca_dupla;
    insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez)
    values (v_vaca_dupla, _hoje_fazenda() - 61, 'pendente'), (v_vaca_dupla, _hoje_fazenda() - 60, 'pendente');

    if exists (select 1 from coberturas_atuais where vaca_id = v_vaca_velha) then
      raise exception 'FALHOU [coberturas_atuais]: positiva de antes do parto ativo não deveria contar';
    end if;
    if (select count(*) from coberturas_atuais where vaca_id = v_vaca_dupla) <> 1 then
      raise exception 'FALHOU [coberturas_atuais]: deveria haver uma linha por vaca';
    end if;

    v_bot := bot_consultar('5500000000001', 'consultar_relatorio', '{"tipo_relatorio": "reprodutivo"}', '', false);
    if v_bot->>'mensagem' ilike '%Vaca 90901: parto em%' or v_bot->>'mensagem' ilike '%Vaca 90901: secar%' then
      raise exception 'FALHOU [_rel_reproducao_fazenda]: vaca vazia apareceu com parto/secagem (veio %)', v_bot;
    end if;
    if (length(v_bot->>'mensagem') - length(replace(v_bot->>'mensagem', 'Vaca 90902: coberta', ''))) / length('Vaca 90902: coberta') <> 1 then
      raise exception 'FALHOU [_rel_reproducao_fazenda]: vaca com duas pendentes deveria aparecer uma vez (veio %)', v_bot;
    end if;

    v_bot := bot_consultar('5500000000001', 'consultar_vaca', '{"numero_vaca": "90901", "tipo_relatorio": "reprodutivo"}', '', false);
    if v_bot->>'mensagem' ilike '%Parto previsto%' or v_bot->>'mensagem' not ilike '%Nenhuma cobertura nesta lactação%' then
      raise exception 'FALHOU [_rel_vaca_reproducao]: cobertura de antes do parto não deveria dar parto previsto (veio %)', v_bot;
    end if;

    if exists (select 1 from alertas_reprodutivos() where vaca_id = v_vaca_velha and tipo in ('secagem_atrasada', 'parto_atrasado')) then
      raise exception 'FALHOU [alertas_reprodutivos]: vaca vazia com alerta de secagem/parto';
    end if;
    if (select count(*) from alertas_reprodutivos() where vaca_id = v_vaca_dupla and tipo = 'diagnostico_atrasado') <> 1 then
      raise exception 'FALHOU [alertas_reprodutivos]: diagnóstico atrasado deveria aparecer uma vez por vaca';
    end if;
  end;

  -- ============================================================
  -- leite da lactação pela vaca/data e parto duplicado (0039)
  -- ============================================================

  declare
    v_vaca_lig uuid;
    v_parto_velho uuid;
    v_parto_novo uuid;
  begin
    insert into vacas (propriedade_id, numero_identificacao, status_produtivo)
    values (v_propriedade_id, 90903, 'lactacao') returning id into v_vaca_lig;
    -- dado antigo: parto anterior só desativado (sem arquivar) e o leite novo ligado a ele
    insert into partos (vaca_id, data_parto, ativa) values (v_vaca_lig, _hoje_fazenda() - 400, false)
      returning id into v_parto_velho;
    insert into partos (vaca_id, data_parto, ativa) values (v_vaca_lig, _hoje_fazenda() - 30, true)
      returning id into v_parto_novo;
    insert into controle_leite (vaca_id, parto_id, litros, data_controle) values
      (v_vaca_lig, v_parto_velho, 99, _hoje_fazenda() - 50),  -- lactação anterior: não conta
      (v_vaca_lig, v_parto_velho, 20, _hoje_fazenda() - 10),  -- ligado ao parto velho, mas é desta lactação
      (v_vaca_lig, v_parto_novo, 10, _hoje_fazenda() - 5);
    v_alvo_bot := _indicadores_lactacao(v_parto_novo);
    if (v_alvo_bot->>'dias_pesados')::integer <> 2 or (v_alvo_bot->>'media')::numeric <> 15 then
      raise exception 'FALHOU [_indicadores_lactacao]: deveria contar o leite da vaca desde o parto (veio %)', v_alvo_bot;
    end if;

    begin
      insert into partos (vaca_id, data_parto, ativa) values (v_vaca_lig, _hoje_fazenda() - 20, true);
      raise exception 'FALHOU [parto duplicado]: parto 10 dias depois de outro deveria ser recusado';
    exception when others then
      if sqlerrm not ilike '%já tem parto registrado em%' then
        raise exception 'FALHOU [parto duplicado]: erro inesperado: %', sqlerrm;
      end if;
    end;

    v_bot := bot_registrar_parto('5500000000001', 90903, _hoje_fazenda(), null, 'femea');
    if (v_bot->>'ok')::boolean or v_bot->>'mensagem' not ilike '%já tem parto registrado em%' then
      raise exception 'FALHOU [parto duplicado]: o bot deveria recusar com a mensagem (veio %)', v_bot;
    end if;
  end;

  raise notice 'TODOS OS TESTES PASSARAM';
end $$;

rollback;
