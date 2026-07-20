-- Testes de regressão para as funções RPC de negócio: cadastrar_vaca, registrar_parto
-- (incluindo o arquivamento de lactação encerrada), secar_vaca e confirmar_diagnostico.
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
  perform registrar_cobertura(v_vaca_filha_id, current_date - 300, 'touro-teste-1');
  select id into v_cobertura_a from coberturas where vaca_id = v_vaca_filha_id order by data_cobertura desc limit 1;
  perform confirmar_diagnostico(v_cobertura_a, 'positivo');

  v_parto_1 := registrar_parto(v_vaca_filha_id, current_date - 210, 101, 'femea');
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

  if v_parto_2.iep is distinct from 210 then
    raise exception 'FALHOU [registrar_parto]: iep do segundo parto calculado errado (esperado 210, veio %)', v_parto_2.iep;
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

  raise notice 'TODOS OS TESTES PASSARAM';
end $$;

rollback;
