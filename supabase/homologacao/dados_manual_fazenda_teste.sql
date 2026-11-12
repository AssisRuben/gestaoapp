-- Dados de exemplo pra Fazenda Teste (produção), pras imagens do Manual do Gestão Pec.
--
-- Rodar no SQL Editor do Supabase. Só mexe na fazenda chamada exatamente 'Fazenda Teste' (para
-- se não achar exatamente uma). Pode rodar mais de uma vez: não duplica nada.
--
-- O que acrescenta:
--   1. Leite: uma pesagem "dia inteiro" por dia, nos últimos 30 dias (até ontem), pra cada vaca em
--      lactação com parto ativo. Dia que já tem pesagem fica como está.
--   2. Financeiro: 6 meses (o atual e os 5 anteriores) de venda de leite e das despesas do dia a
--      dia, proporcionais ao rebanho (custo por volta de R$ 1,50 por litro). Só datas até hoje.
--   3. Perfil da fazenda respondido (tira o aviso "Complete o perfil").
--   4. Uma visita técnica de 14 dias atrás, com 3 recomendações (uma já feita).
--
-- Tudo numa transação: se der erro em qualquer parte, nada é gravado.

begin;

do $$
declare
  v_fazenda constant text := 'Fazenda Teste';
  v_prop uuid;
  v_qtd integer;
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_tecnico uuid := (select id from auth.users where email = 'gabrieltecnico@hotmail.com');
  v_vacas_lactacao integer;
  v_receita_base numeric;
  v_mes date;
  v_data date;
  v_dia date;
  v_visita uuid;
  r record;
  l record;
  v_leite integer := 0;
  v_fin integer := 0;
begin
  select count(*), (array_agg(id))[1] into v_qtd, v_prop
  from propriedades where nome_propriedade = v_fazenda;
  if v_qtd <> 1 then
    raise exception 'Esperava 1 fazenda chamada "%", achei %. Nada foi gravado.', v_fazenda, v_qtd;
  end if;

  -- 1. Leite --------------------------------------------------------------------------------
  for r in
    select v.id as vaca_id, v.numero_identificacao as numero, p.id as parto_id, p.data_parto
    from vacas v
    cross join lateral (
      select id, data_parto from partos
      where vaca_id = v.id and ativa
      order by data_parto desc limit 1
    ) p
    where v.propriedade_id = v_prop and v.status_produtivo = 'lactacao'
  loop
    for v_dia in
      select d::date from generate_series(greatest(v_hoje - 30, r.data_parto + 1), v_hoje - 1, interval '1 day') d
    loop
      if not exists (select 1 from controle_leite where vaca_id = r.vaca_id and data_controle = v_dia) then
        -- cada vaca tem o seu "nível" (10 a 22 L) e varia um pouco a cada dia
        insert into controle_leite (vaca_id, parto_id, litros, data_controle, periodo)
        values (
          r.vaca_id, r.parto_id,
          round((10 + (coalesce(r.numero, 0) % 13) + random() * 3 - 1.5)::numeric, 1),
          v_dia, 'dia_inteiro'
        );
        v_leite := v_leite + 1;
      end if;
    end loop;
  end loop;

  -- 2. Financeiro ---------------------------------------------------------------------------
  select count(*) into v_vacas_lactacao
  from vacas where propriedade_id = v_prop and status_produtivo = 'lactacao';
  -- receita do mês ≈ vacas × 16 L × 30 dias × R$ 2,20
  v_receita_base := greatest(v_vacas_lactacao, 1) * 16 * 30 * 2.20;

  for v_mes in
    select date_trunc('month', m)::date
    from generate_series(date_trunc('month', v_hoje) - interval '5 months', date_trunc('month', v_hoje), interval '1 month') m
  loop
    for l in
      select * from (values
        ('receita', 'venda de leite',     10, 1.00),
        ('despesa', 'racao',               5, 0.40),
        ('despesa', 'energia eletrica',    5, 0.04),
        ('despesa', 'medicacao',          15, 0.03),
        ('despesa', 'produtos da ordenha',15, 0.02),
        ('despesa', 'mao de obra',        20, 0.17),
        ('despesa', 'manutencao',         25, 0.025),
        ('despesa', 'veterinario',        25, 0.015)
      ) as t(tipo, categoria, dia, fator)
    loop
      v_data := v_mes + (l.dia - 1);
      if v_data <= v_hoje and not exists (
        select 1 from financeiro
        where propriedade_id = v_prop and data = v_data and tipo = l.tipo and categoria = l.categoria
      ) then
        insert into financeiro (propriedade_id, tipo, categoria, valor, data)
        values (v_prop, l.tipo, l.categoria, round(v_receita_base * l.fator * (0.92 + random() * 0.16)::numeric, 2), v_data);
        v_fin := v_fin + 1;
      end if;
    end loop;
  end loop;

  -- uma venda de bezerro, dois meses atrás
  v_data := (date_trunc('month', v_hoje) - interval '2 months')::date + 17;
  if not exists (
    select 1 from financeiro where propriedade_id = v_prop and data = v_data and categoria = 'venda de animal'
  ) then
    insert into financeiro (propriedade_id, tipo, categoria, valor, data)
    values (v_prop, 'receita', 'venda de animal', 1800, v_data);
    v_fin := v_fin + 1;
  end if;

  -- 3. Perfil da fazenda --------------------------------------------------------------------
  perform _salvar_perfil_fazenda(v_prop, jsonb_build_object(
    'area_total_ha', 40, 'area_leite_ha', 25, 'irrigado', 'sim', 'area_irrigada_ha', 6,
    'raca', 'girolando', 'inseminacao', '1_3', 'mao_de_obra', 'familia_contratado', 'pessoas', 3,
    'ordenha', 'mecanica', 'ordenhas_dia', 2, 'destino_leite', 'laticinio', 'tanque', 'sim'
  ), v_tecnico);

  -- 4. Visita técnica -----------------------------------------------------------------------
  if not exists (select 1 from visitas where propriedade_id = v_prop and data_visita = v_hoje - 14) then
    insert into visitas (propriedade_id, data_visita, observacoes, autor_id, autor_nome)
    values (
      v_prop, v_hoje - 14,
      'Pasto em boa condição, com rebrota depois das chuvas. Rebanho em bom escore corporal. Ordenha limpa; controle leiteiro em dia. Algumas vacas cobertas há mais de 45 dias ainda sem diagnóstico.',
      v_tecnico, 'Gabriel Cândido'
    )
    returning id into v_visita;

    insert into recomendacoes (visita_id, propriedade_id, texto, prazo, concluida_em, concluida_por_nome) values
      (v_visita, v_prop, 'Fazer o diagnóstico de prenhez das vacas cobertas há mais de 45 dias', v_hoje + 7, null, null),
      (v_visita, v_prop, 'Trocar o sal mineral do cocho das vacas em lactação', v_hoje + 7, v_hoje - 10, 'João da Silva'),
      (v_visita, v_prop, 'Pesar o leite de todas as vacas pelo menos uma vez por semana', v_hoje + 14, null, null);
  end if;

  raise notice 'Fazenda Teste: % pesagens de leite e % lançamentos financeiros acrescentados; perfil e visita prontos.',
    v_leite, v_fin;
end $$;

commit;

-- Opcional, só se quiser as imagens dos Acessos (capítulo 5) com o campo "Dar acesso a um técnico":
-- liga a conta de teste gabrieligt@gmail.com à Fazenda Teste como produtor.
--
-- insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
-- select u.id, p.id, 'produtor'
-- from auth.users u, propriedades p
-- where u.email = 'gabrieligt@gmail.com' and p.nome_propriedade = 'Fazenda Teste'
-- on conflict do nothing;
