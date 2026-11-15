-- Doses do programa com o TÉCNICO, para a rodada de testes do lançamento (16/11/2026).
--
-- Rode DEPOIS de dados_teste_lancamento.sql (usa os touros "Touro Teste Alfa/Beta" e a
-- "Fazenda Piloto (testes)"). Faz o papel do gestor em "+ Nova entrega → Para um técnico":
--   - Touro Teste Alfa: 6 doses AGUARDANDO o técnico confirmar (teste "confirmar recebimento")
--   - Touro Teste Beta: 4 doses JÁ confirmadas (o técnico já pode usar na cobertura)
-- e dá ao técnico acesso à fazenda de testes, pra ele usar as doses nas vacas dela.
--
-- O que o técnico testa depois (logado com a conta dele):
--   Reprodução → "Minhas doses (técnico)": confirmar as 6 do Alfa, registrar perda, passar doses
--   pra fazenda ("Passar doses") e cancelar a passagem enquanto a fazenda não confirma.
--   Nova cobertura / Lançar no campo: "De quem é a dose" (fazenda ou técnico) — a fazenda tem saldo
--   do Alfa e o técnico também.
--
-- Como rodar: SQL Editor → mude o e-mail em "CONFIGURE AQUI" → Run. Pode rodar mais de uma vez
-- (cada vez cria entregas novas).

do $$
declare
  -- ===================== CONFIGURE AQUI =====================
  v_email_tecnico text := 'tecnico@exemplo.com';     -- conta do técnico (precisa existir no site)
  v_fazenda       text := 'Fazenda Piloto (testes)'; -- fazenda que o técnico vai atender (null = nenhuma)
  -- ==========================================================

  h date := _hoje_fazenda();
  v_tecnico uuid;
  v_prop uuid;
  v_alfa uuid := (select id from touros where lower(codigo) = 'tt-alfa');
  v_beta uuid := (select id from touros where lower(codigo) = 'tt-beta');
  v_ent uuid := (select id from entidades where lower(trim(nome)) = lower('Associação Teste do Lançamento'));
begin
  select id into v_tecnico from auth.users where lower(email) = lower(trim(v_email_tecnico));
  if v_tecnico is null then
    raise exception 'Não existe conta com o e-mail % — o técnico cria a conta no site (Cadastre-se → Sou técnico)', v_email_tecnico;
  end if;
  if v_alfa is null or v_beta is null then
    raise exception 'Touros de teste não encontrados — rode antes dados_teste_lancamento.sql';
  end if;

  -- entregas do gestor ao técnico
  insert into entregas_doses_tecnico (tecnico_id, touro_id, quantidade, kits, entidade_id, data_entrega, observacao)
  values (v_tecnico, v_alfa, 6, 1, v_ent, h - 1, 'Teste do lançamento — aguardando confirmação');
  insert into entregas_doses_tecnico (tecnico_id, touro_id, quantidade, kits, entidade_id, data_entrega, observacao, recebido_em)
  values (v_tecnico, v_beta, 4, 1, v_ent, h - 7, 'Teste do lançamento — já confirmada', now());

  -- acesso do técnico à fazenda de testes (se ele já for produtor dela, continua produtor)
  if v_fazenda is not null then
    select id into v_prop from propriedades where nome_propriedade = v_fazenda;
    if v_prop is null then
      raise notice 'Fazenda "%" não encontrada — doses criadas, mas sem acesso a fazenda', v_fazenda;
    else
      insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
      values (v_tecnico, v_prop, 'tecnico')
      on conflict (usuario_id, propriedade_id) do nothing;
    end if;
  end if;

  raise notice 'Pronto: % com 6 doses do Alfa a confirmar e 4 do Beta disponíveis.', v_email_tecnico;
end $$;

-- Conferir o saldo do técnico (troque o e-mail):
-- select t.nome as touro, s.*
-- from saldo_doses_tecnico s join touros t on t.id = s.touro_id
-- where s.tecnico_id = (select id from auth.users where email = 'tecnico@exemplo.com');
