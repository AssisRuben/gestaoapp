-- Fazenda para a rodada de testes do lançamento (16/11/2026).
--
-- Cria a "Fazenda Piloto (testes)" com 8 vacas, partos, coberturas, diagnósticos, pesagens,
-- financeiro, botijão e doses do programa de sêmen — usando as MESMAS funções do site
-- (registrar_parto, registrar_cobertura, confirmar_diagnostico, registrar_pesagem, secar_vaca,
-- registrar_abastecimento_botijao), então tudo passa pelas regras de verdade.
--
-- Como rodar: SQL Editor do Supabase → cole tudo → Run. Mude só os 3 valores em "CONFIGURE AQUI".
-- Se a fazenda já existir, o script para sem fazer nada (rode o bloco "APAGAR" do fim antes).
--
-- O que dá pra testar depois:
--   Início ........... 4 vacas em lactação, pendências de secar, diagnóstico e parto previsto
--   Reprodução ....... coberturas pendente / positiva, parto previsto, secagem, doses
--   Leite ............ 7 dias de pesagem (manhã e tarde) de 4 vacas
--   Financeiro ....... receitas e despesas deste mês e do mês passado
--   Botijão .......... 2 abastecimentos (sem foto: aparece "sem foto"; teste a foto pelo site/bot)
--   Programa ......... Touro Teste Alfa: 10 doses confirmadas (3 usadas = saldo 7)
--                      Touro Teste Beta: 5 doses AGUARDANDO confirmação (teste "confirmar recebimento")
--   Bezerros ......... 5 bezerros dos partos (a bezerra 101, filha da Mimosa, serve pro "Virou vaca")
--   WhatsApp ......... se informar um número, "informações da Mimosa", "a Estrela deu 15 litros" etc.

do $$
declare
  -- ===================== CONFIGURE AQUI =====================
  v_email     text := 'assismontenegro@hotmail.com';   -- conta que vira PRODUTOR da fazenda
  v_whatsapp  text := null;    -- ex.: '(85) 99999-0000' — WhatsApp de teste pro bot (null = sem bot)
  v_fazenda   text := 'Fazenda Piloto (testes)';
  -- ==========================================================

  h date := _hoje_fazenda();
  v_usuario uuid;
  v_prop uuid;
  v_alfa uuid;
  v_beta uuid;
  v_ent uuid;
  v_v1 uuid; v_v2 uuid; v_v3 uuid; v_v4 uuid; v_v5 uuid; v_v6 uuid; v_v7 uuid; v_v8 uuid;
  v_cob coberturas;
  d integer;
begin
  select id into v_usuario from auth.users where lower(email) = lower(trim(v_email));
  if v_usuario is null then
    raise exception 'Não existe conta com o e-mail % — crie a conta no site antes', v_email;
  end if;
  if exists (select 1 from propriedades where nome_propriedade = v_fazenda) then
    raise exception 'A fazenda "%" já existe. Rode o bloco APAGAR (fim do arquivo) antes de recriar.', v_fazenda;
  end if;

  -- fazenda + acesso de produtor (as funções do site conferem esse vínculo)
  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel)
  values (v_fazenda, 'Produtor Piloto', 'Quixadá', 'CE', 'Equipe Gestão Pec')
  returning id into v_prop;
  insert into usuarios_propriedades (usuario_id, propriedade_id, papel) values (v_usuario, v_prop, 'produtor');
  if v_whatsapp is not null then
    insert into usuarios_whatsapp (propriedade_id, telefone) values (v_prop, v_whatsapp);
  end if;

  -- daqui pra frente roda "como" essa conta (autoria = site, acesso conferido pelas funções)
  perform set_config('request.jwt.claim.sub', v_usuario::text, true);

  -- ---------- programa de sêmen: touros, entidade e entregas ----------
  select id into v_alfa from touros where lower(codigo) = 'tt-alfa';
  if v_alfa is null then
    insert into touros (nome, codigo, raca, central, pta_leite)
    values ('Touro Teste Alfa', 'TT-ALFA', 'Girolando', 'Central Teste', 650) returning id into v_alfa;
  end if;
  select id into v_beta from touros where lower(codigo) = 'tt-beta';
  if v_beta is null then
    insert into touros (nome, codigo, raca, central, pta_leite)
    values ('Touro Teste Beta', 'TT-BETA', 'Holandês', 'Central Teste', 820) returning id into v_beta;
  end if;
  select id into v_ent from entidades where lower(trim(nome)) = lower('Associação Teste do Lançamento');
  if v_ent is null then
    insert into entidades (nome, responsavel, telefone)
    values ('Associação Teste do Lançamento', 'Maria Teste', '(85) 98888-0000') returning id into v_ent;
  end if;

  -- Alfa: 10 doses entregues e já confirmadas; Beta: 5 doses esperando a fazenda confirmar
  insert into entregas_doses (propriedade_id, touro_id, quantidade, kits, entidade_id, data_entrega, recebido_em, recebido_por)
  values (v_prop, v_alfa, 10, 2, v_ent, h - 90, now(), v_usuario);
  insert into entregas_doses (propriedade_id, touro_id, quantidade, kits, entidade_id, data_entrega)
  values (v_prop, v_beta, 5, 1, v_ent, h - 2);

  -- ---------- rebanho ----------
  insert into vacas (propriedade_id, numero_identificacao, nome, status_produtivo, status_reprodutivo) values
    (v_prop, 1, 'Mimosa',  'novilha', 'vazia'),
    (v_prop, 2, 'Estrela', 'novilha', 'vazia'),
    (v_prop, 3, 'Jandira', 'novilha', 'vazia'),
    (v_prop, 4, 'Pintada', 'novilha', 'vazia'),
    (v_prop, 5, 'Malhada', 'novilha', 'vazia'),
    (v_prop, 6, 'Boneca',  'novilha', 'vazia'),
    (v_prop, 7, 'Flor',    'novilha', 'vazia'),
    (v_prop, 8, null,      'novilha', 'vazia');   -- sem nome: testa o "só número"
  select id into v_v1 from vacas where propriedade_id = v_prop and numero_identificacao = 1;
  select id into v_v2 from vacas where propriedade_id = v_prop and numero_identificacao = 2;
  select id into v_v3 from vacas where propriedade_id = v_prop and numero_identificacao = 3;
  select id into v_v4 from vacas where propriedade_id = v_prop and numero_identificacao = 4;
  select id into v_v5 from vacas where propriedade_id = v_prop and numero_identificacao = 5;
  select id into v_v6 from vacas where propriedade_id = v_prop and numero_identificacao = 6;
  select id into v_v7 from vacas where propriedade_id = v_prop and numero_identificacao = 7;
  select id into v_v8 from vacas where propriedade_id = v_prop and numero_identificacao = 8;

  -- 1 Mimosa: pariu há 60 dias (bezerra 101); coberta há 35 dias com dose do programa, SEM diagnóstico
  perform registrar_parto(v_v1, h - 60, 101, 'femea');
  perform registrar_cobertura(v_v1, h - 35, null, v_alfa, true);

  -- 2 Estrela: pariu há 120 dias (bezerro 102); coberta há 70 dias com dose do programa, PRENHE
  perform registrar_parto(v_v2, h - 120, 102, 'macho');
  v_cob := registrar_cobertura(v_v2, h - 70, null, v_alfa, true);
  perform confirmar_diagnostico(v_cob.id, 'positivo');

  -- 3 Jandira: pariu há 320 dias (bezerra 103); prenhe de 215 dias → SECAR nos próximos dias
  perform registrar_parto(v_v3, h - 320, 103, 'femea');
  v_cob := registrar_cobertura(v_v3, h - 215, 'Touro da vizinhança');
  perform confirmar_diagnostico(v_cob.id, 'positivo');

  -- 4 Pintada: pariu há 400 dias (bezerro 104); prenhe de 255 dias e já SECA → PARTO PREVISTO em ~4 semanas
  perform registrar_parto(v_v4, h - 400, 104, 'macho');
  v_cob := registrar_cobertura(v_v4, h - 255, 'Touro da vizinhança');
  perform confirmar_diagnostico(v_cob.id, 'positivo');
  perform secar_vaca(v_v4);

  -- 5 Malhada: novilha vazia, sem nada (teste de cadastro/cobertura do zero)

  -- 6 Boneca: novilha coberta há 10 dias com dose do programa (diagnóstico ainda cedo)
  perform registrar_cobertura(v_v6, h - 10, null, v_alfa, true);

  -- 7 Flor: pariu há 20 dias (bezerra 105), sem cobertura ainda
  perform registrar_parto(v_v7, h - 20, 105, 'femea');

  -- 8 (sem nome): novilha vazia

  -- ---------- leite: 7 dias de pesagem, manhã e tarde, das 4 vacas em lactação ----------
  for d in 1..7 loop
    perform registrar_pesagem(v_prop, h - d, 'manha', jsonb_build_array(
      jsonb_build_object('vaca_id', v_v1, 'litros', 11 + (d % 3)),
      jsonb_build_object('vaca_id', v_v2, 'litros', 9 + (d % 2)),
      jsonb_build_object('vaca_id', v_v3, 'litros', 5 + (d % 2)),
      jsonb_build_object('vaca_id', v_v7, 'litros', 13 + (d % 4))));
    perform registrar_pesagem(v_prop, h - d, 'tarde', jsonb_build_array(
      jsonb_build_object('vaca_id', v_v1, 'litros', 8 + (d % 2)),
      jsonb_build_object('vaca_id', v_v2, 'litros', 7),
      jsonb_build_object('vaca_id', v_v3, 'litros', 4),
      jsonb_build_object('vaca_id', v_v7, 'litros', 10 + (d % 3))));
  end loop;

  -- ---------- financeiro: este mês e o mês passado ----------
  insert into financeiro (propriedade_id, tipo, categoria, valor, data) values
    (v_prop, 'receita', 'venda de leite',    4200, h - 2),
    (v_prop, 'receita', 'venda de animal',   2500, h - 12),
    (v_prop, 'despesa', 'racao',             1800, h - 3),
    (v_prop, 'despesa', 'mao de obra',       1500, h - 5),
    (v_prop, 'despesa', 'medicacao',          240, h - 10),
    (v_prop, 'despesa', 'energia eletrica',   320, h - 15),
    (v_prop, 'receita', 'venda de leite',    3900, h - 33),
    (v_prop, 'despesa', 'racao',             1700, h - 35),
    (v_prop, 'despesa', 'veterinario',        150, h - 40);

  -- ---------- botijão: 2 abastecimentos (cada um lança a despesa de inseminação artificial) ----------
  perform registrar_abastecimento_botijao(v_prop, h - 40, 38, 175, v_prop::text || '/teste-sem-foto-1.jpg');
  perform registrar_abastecimento_botijao(v_prop, h - 5,  23, 180, v_prop::text || '/teste-sem-foto-2.jpg');

  raise notice 'Pronto: "%" criada (id %). Saldo do Touro Teste Alfa: 7 doses; Beta aguardando confirmação.', v_fazenda, v_prop;
end $$;

-- ============================================================
-- APAGAR a fazenda de testes (rode só isto, quando quiser recomeçar ou limpar)
-- ============================================================
-- do $$
-- declare v_prop uuid := (select id from propriedades where nome_propriedade = 'Fazenda Piloto (testes)');
-- begin
--   if v_prop is null then raise notice 'nada a apagar'; return; end if;
--   delete from controle_leite where vaca_id in (select id from vacas where propriedade_id = v_prop);
--   delete from controle_leite_historico where vaca_id in (select id from vacas where propriedade_id = v_prop);
--   delete from coberturas where vaca_id in (select id from vacas where propriedade_id = v_prop);
--   delete from coberturas_historico where vaca_id in (select id from vacas where propriedade_id = v_prop);
--   delete from bezerros where propriedade_id = v_prop;
--   delete from partos where vaca_id in (select id from vacas where propriedade_id = v_prop);
--   delete from partos_historico where vaca_id in (select id from vacas where propriedade_id = v_prop);
--   delete from vacas where propriedade_id = v_prop;
--   delete from botijao_abastecimentos where propriedade_id = v_prop;
--   delete from financeiro where propriedade_id = v_prop;
--   delete from patrimonio where propriedade_id = v_prop;
--   delete from usuarios_whatsapp where propriedade_id = v_prop;
--   delete from interacoes_log where propriedade_id = v_prop;
--   delete from propriedades where id = v_prop;   -- o resto (entregas, acessos, uso do bot…) sai em cascata
--   raise notice 'Fazenda de testes apagada';
-- end $$;
