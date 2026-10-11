-- Dados de exemplo pra HOMOLOGAÇÃO: a "Fazenda Demonstração", com rebanho em fases diferentes pra
-- todas as telas e alertas terem o que mostrar. NUNCA rodar na produção.
--
--   vacas 1–8   em lactação (paridas há 20 a 250 dias), pesagem de manhã e de tarde nos últimos 60 dias
--   vaca 3      prenhe confirmada (dias em aberto fechados)
--   vaca 4      cobertura pendente há 50 dias (alerta de diagnóstico atrasado / lembrete)
--   vaca 5      diagnóstico negativo e nova cobertura pendente (em serviço)
--   vaca 7      218 dias de lactação sem prenhez (alerta "vazia há muito tempo")
--   vaca 8      prenhe, ainda em lactação, com secagem atrasada
--   vacas 9–10  secas e prenhes, parto em poucos dias
--   vacas 11–12 novilhas; bezerros dos partos; 6 meses de financeiro
--
-- Depois de criar sua conta no site de homologação, vincule-a (troque o e-mail):
--   insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
--   select id, 'dddddddd-0000-0000-0000-000000000001', 'produtor' from auth.users where email = 'SEU_EMAIL';
-- E troque o WhatsApp abaixo pelo número de teste do bot de homologação.

do $$
declare
  v_prop constant uuid := 'dddddddd-0000-0000-0000-000000000001';
  v_hoje date := _hoje_fazenda();
  v_vaca uuid;
  v_parto uuid;
  v_dias_parto integer;
  v_d integer;
  v_base numeric;
  i integer;
begin
  if exists (select 1 from propriedades where id = v_prop) then
    raise notice 'Fazenda Demonstração já existe — nada feito';
    return;
  end if;

  -- carga de exemplo não é "lançamento de alguém": sem marcar autoria
  alter table vacas disable trigger autoria;
  alter table partos disable trigger autoria;
  alter table coberturas disable trigger autoria;
  alter table controle_leite disable trigger autoria;
  alter table bezerros disable trigger autoria;
  alter table financeiro disable trigger autoria;

  insert into propriedades (id, nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel, latitude, longitude)
  values (v_prop, 'Fazenda Demonstração', 'Produtor Exemplo', 'Quixadá', 'CE', 'Técnico Exemplo', -4.97, -39.01);

  insert into usuarios_whatsapp (propriedade_id, telefone) values (v_prop, '(85) 90000-0000');

  for i in 1..12 loop
    insert into vacas (propriedade_id, numero_identificacao, status_produtivo, status_reprodutivo)
    values (v_prop, i,
      case when i <= 8 then 'lactacao' when i <= 10 then 'seca' else 'novilha' end,
      'vazia')
    returning id into v_vaca;

    if i <= 10 then
      -- vacas 1–8: paridas há 20..250 dias; 9–10: parto da lactação anterior há 330 dias
      v_dias_parto := case when i <= 8 then 20 + (i - 1) * 33 else 330 end;
      insert into partos (vaca_id, data_parto, ativa, iep)
      values (v_vaca, v_hoje - v_dias_parto, true, case when i % 3 = 0 then null else 380 + i * 7 end)
      returning id into v_parto;

      insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento)
      values (v_prop, v_parto, v_vaca, 100 + i, case when i % 2 = 0 then 'femea' else 'macho' end, v_hoje - v_dias_parto);

      -- leite: curva simples (sobe até ~60 dias, depois cai devagar), manhã e tarde
      if i <= 8 then
        for v_d in 0..least(59, v_dias_parto) loop
          v_base := round((14 + 6 * least(v_dias_parto - v_d, 60) / 60.0 - 0.02 * greatest(v_dias_parto - v_d - 60, 0)
                    + sin(i * 7 + v_d) * 1.2)::numeric, 1);
          insert into controle_leite (vaca_id, parto_id, litros, data_controle, periodo) values
            (v_vaca, v_parto, greatest(v_base * 0.55, 3), v_hoje - v_d, 'manha'),
            (v_vaca, v_parto, greatest(v_base * 0.45, 2), v_hoje - v_d, 'tarde');
        end loop;
      end if;
    end if;

    -- situações reprodutivas
    if i = 8 then
      insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez, touro_semen) values (v_vaca, v_hoje - 228, 'positivo', 'Touro Exemplo');
    elsif i = 3 then
      insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez, touro_semen) values (v_vaca, v_hoje - 30, 'positivo', 'Touro Exemplo');
    elsif i = 4 then
      insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez) values (v_vaca, v_hoje - 50, 'pendente');
    elsif i = 5 then
      insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez) values
        (v_vaca, v_hoje - 70, 'negativo'), (v_vaca, v_hoje - 10, 'pendente');
    elsif i in (9, 10) then
      insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez, touro_semen) values (v_vaca, v_hoje - 278 + i, 'positivo', 'Touro Exemplo');
    end if;
  end loop;

  -- financeiro dos últimos 6 meses
  for i in 0..5 loop
    insert into financeiro (propriedade_id, tipo, categoria, valor, data) values
      (v_prop, 'receita', 'venda de leite', 9000 + i * 350, (date_trunc('month', v_hoje) - make_interval(months => i))::date + 9),
      (v_prop, 'despesa', 'racao', 3800 + i * 120, (date_trunc('month', v_hoje) - make_interval(months => i))::date + 4),
      (v_prop, 'despesa', 'mao de obra', 1800, (date_trunc('month', v_hoje) - make_interval(months => i))::date + 5),
      (v_prop, 'despesa', 'energia eletrica', 420, (date_trunc('month', v_hoje) - make_interval(months => i))::date + 12),
      (v_prop, 'despesa', 'medicacao', 250 + i * 30, (date_trunc('month', v_hoje) - make_interval(months => i))::date + 18);
  end loop;

  alter table vacas enable trigger autoria;
  alter table partos enable trigger autoria;
  alter table coberturas enable trigger autoria;
  alter table controle_leite enable trigger autoria;
  alter table bezerros enable trigger autoria;
  alter table financeiro enable trigger autoria;

  raise notice 'Fazenda Demonstração criada (12 vacas, % lançamentos de leite)',
    (select count(*) from controle_leite c join vacas v on v.id = c.vaca_id where v.propriedade_id = v_prop);
end $$;
