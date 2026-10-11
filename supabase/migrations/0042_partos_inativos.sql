-- Partos inativos deixados pelo bot antigo (antes da 0022 ele fechava a lactação com ativa=false,
-- sem arquivar). Itens 11 e 12 do diagnóstico de 11/10/2026. Decisões do usuário:
--
-- 1. Vaca "em lactação" SEM parto ativo, cujo parto mais recente ficou inativo (Fazenda Bandeira,
--    vacas 1, 2 e 3): esse parto É a lactação atual — volta a ficar ativo. Só reativa parto dos
--    últimos 400 dias e que não tem parto mais novo nem no histórico.
-- 2. Fazenda Teste (dado de teste): cada vaca fica só com o parto atual. Parto a menos de 240 dias
--    dele (duplicado, inclusive no mesmo dia) sai — o leite de depois do parto atual passa pra ele, o
--    resto sai junto; parto antigo legítimo (240+ dias) é arquivado como o registrar_parto faz. IEP
--    do parto atual recalculado.
-- Em outro banco (homologação, banco do zero) a parte 2 não faz nada e a 1 só age se houver o caso.

-- ============================================================
-- 1. Reativar a lactação atual que ficou inativa
-- ============================================================

do $$
declare
  v record;
begin
  for v in
    select distinct on (p.vaca_id) p.id, p.vaca_id, p.data_parto
    from partos p
    join vacas va on va.id = p.vaca_id
    where va.status_produtivo = 'lactacao'
      and not exists (select 1 from partos a where a.vaca_id = p.vaca_id and a.ativa)
    order by p.vaca_id, p.data_parto desc
  loop
    continue when v.data_parto < _hoje_fazenda() - 400;
    continue when exists (select 1 from partos_historico h where h.vaca_id = v.vaca_id and h.data_parto > v.data_parto);
    update partos set ativa = true where id = v.id;
    perform _recalcular_status_reprodutivo(v.vaca_id);
  end loop;
end $$;

-- ============================================================
-- 2. Fazenda Teste: só o parto atual de cada vaca
-- ============================================================

do $$
declare
  v_vaca uuid;
  v_ativo partos;
  v_p partos;
  v_anterior date;
begin
  for v_vaca in
    select id from vacas where propriedade_id = '5e6f5a6d-dd44-49e6-96af-4a5f8ff587fd'
  loop
    select * into v_ativo from partos where vaca_id = v_vaca and ativa order by data_parto desc limit 1;
    continue when v_ativo.id is null;

    for v_p in select * from partos where vaca_id = v_vaca and id <> v_ativo.id loop
      if abs(v_p.data_parto - v_ativo.data_parto) < 240 then
        -- duplicado: o que é da lactação atual fica com o parto atual; o resto sai
        update controle_leite set parto_id = v_ativo.id
        where parto_id = v_p.id and data_controle >= v_ativo.data_parto;
        delete from controle_leite where parto_id = v_p.id;
        update bezerros set parto_id = null where parto_id = v_p.id;
        delete from partos where id = v_p.id;
      elsif v_p.data_parto < v_ativo.data_parto then
        -- lactação antiga de verdade: arquiva como o registrar_parto faz
        update controle_leite set parto_id = v_ativo.id
        where parto_id = v_p.id and data_controle >= v_ativo.data_parto;
        insert into controle_leite_historico (id, vaca_id, parto_id, litros, data_controle, created_at)
        select id, vaca_id, parto_id, litros, data_controle, created_at from controle_leite where parto_id = v_p.id;
        delete from controle_leite where parto_id = v_p.id;

        insert into coberturas_historico (id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at)
        select id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at
        from coberturas
        where vaca_id = v_vaca and data_cobertura >= v_p.data_parto and data_cobertura < v_ativo.data_parto
          and id is distinct from v_ativo.cobertura_id;
        delete from coberturas
        where vaca_id = v_vaca and data_cobertura >= v_p.data_parto and data_cobertura < v_ativo.data_parto
          and id is distinct from v_ativo.cobertura_id;

        update bezerros set parto_id = null where parto_id = v_p.id;
        insert into partos_historico (id, vaca_id, cobertura_id, data_parto, producao_total, projecao_305, persistencia, dias_em_aberto, iep, created_at)
        select id, vaca_id, cobertura_id, data_parto, producao_total, projecao_305, persistencia, dias_em_aberto, iep, created_at
        from partos where id = v_p.id;
        delete from partos where id = v_p.id;
      end if;
    end loop;

    -- duplicados já arquivados (ex.: vaca 1, 19/07/2026) e o leite arquivado deles
    delete from controle_leite_historico
    where parto_id in (select id from partos_historico
                       where vaca_id = v_vaca and abs(data_parto - v_ativo.data_parto) < 240);
    delete from partos_historico where vaca_id = v_vaca and abs(data_parto - v_ativo.data_parto) < 240;

    select max(d) into v_anterior from (
      select data_parto as d from partos where vaca_id = v_vaca and id <> v_ativo.id
      union all
      select data_parto from partos_historico where vaca_id = v_vaca
    ) x where d < v_ativo.data_parto;
    update partos set iep = v_ativo.data_parto - v_anterior
    where id = v_ativo.id and iep is distinct from v_ativo.data_parto - v_anterior;
  end loop;
end $$;
