-- Rebanho e ciclo reprodutivo de exemplo pra Fazenda Teste (produção).
--
-- Rodar no SQL Editor do Supabase ANTES de dados_manual_fazenda_teste.sql (esse põe leite,
-- financeiro, perfil e visita em cima das vacas em lactação criadas aqui).
-- Só mexe na fazenda chamada exatamente 'Fazenda Teste' (para se não achar exatamente uma).
-- Pode rodar de novo: vaca que já existe (mesmo número) é pulada.
--
-- O que cria (números 101 a 109, datas relativas a hoje, fuso de Fortaleza):
--   101  lactação, parto há 20 dias, vazia, bezerra 201
--   102  lactação, parto há 45 dias, cobertura pendente (vazia_em_servico), bezerro 202
--   103  lactação, parto há 90 dias, cobertura positiva há 50 dias (prenhe)
--   104  lactação, parto há 150 dias, positiva há 100 dias (prenhe)
--   105  lactação, parto há 210 dias, positiva há 120 dias (prenhe)
--   106  lactação, parto há 260 dias, cobertura negativa e depois positiva (prenhe)
--   107  seca, parto há 330 dias, positiva há 200 dias (secagem em ~23 dias)
--   108  novilha vazia
--   109  novilha com cobertura pendente
--
-- Tudo numa transação: se der erro em qualquer parte, nada é gravado.

begin;

do $$
declare
  v_fazenda constant text := 'Fazenda Teste';
  v_prop uuid;
  v_qtd integer;
  v_hoje date := (now() at time zone 'America/Fortaleza')::date;
  v_vaca uuid;
  v_parto uuid;
  v_criadas integer := 0;
  r record;
begin
  select count(*), (array_agg(id))[1] into v_qtd, v_prop
  from propriedades where nome_propriedade = v_fazenda;
  if v_qtd <> 1 then
    raise exception 'Esperava 1 fazenda chamada "%", achei %. Nada foi gravado.', v_fazenda, v_qtd;
  end if;

  -- numero, nome, produtivo, dias desde o parto, iep, dias desde a cobertura 1 e seu diagnóstico,
  -- dias desde a cobertura 2 e seu diagnóstico, sexo do bezerro (null = sem bezerro)
  for r in
    select * from (values
      (101, 'Estrela',  'lactacao', 20,  395, null::int, null::text, null::int, null::text, 'femea'),
      (102, 'Mimosa',   'lactacao', 45,  410, 35,   'pendente',      null,      null,        'macho'),
      (103, 'Jandira',  'lactacao', 90,  380, 50,   'positivo',      null,      null,        null),
      (104, 'Fortuna',  'lactacao', 150, 420, 100,  'positivo',      null,      null,        null),
      (105, 'Pintada',  'lactacao', 210, 450, 120,  'positivo',      null,      null,        null),
      (106, 'Ceição',   'lactacao', 260, 365, 90,   'negativo',      30,        'positivo',   null),
      (107, 'Boneca',   'seca',     330, 400, 200,  'positivo',      null,      null,        null),
      (108, 'Faceira',  'novilha',  null, null, null, null,          null,      null,        null),
      (109, 'Perola',   'novilha',  null, null, 15,  'pendente',     null,      null,        null)
    ) as t(numero, nome, produtivo, dias_parto, iep, dias_cob1, diag1, dias_cob2, diag2, sexo_bezerro)
  loop
    if exists (select 1 from vacas where propriedade_id = v_prop and numero_identificacao = r.numero) then
      continue;
    end if;

    insert into vacas (propriedade_id, numero_identificacao, nome, status_produtivo, status_reprodutivo, data_parto)
    values (v_prop, r.numero, r.nome, r.produtivo, 'vazia',
            case when r.dias_parto is null then null else v_hoje - r.dias_parto end)
    returning id into v_vaca;

    v_parto := null;
    if r.dias_parto is not null then
      insert into partos (vaca_id, data_parto, iep, ativa)
      values (v_vaca, v_hoje - r.dias_parto, r.iep, true)
      returning id into v_parto;
    end if;

    if r.dias_cob1 is not null then
      insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez, touro_semen)
      values (v_vaca, v_hoje - r.dias_cob1, r.diag1, 'Touro Teste');
    end if;
    if r.dias_cob2 is not null then
      insert into coberturas (vaca_id, data_cobertura, diagnostico_prenhez, touro_semen)
      values (v_vaca, v_hoje - r.dias_cob2, r.diag2, 'Touro Teste');
    end if;

    if r.sexo_bezerro is not null then
      insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento)
      values (v_prop, v_parto, v_vaca, r.numero + 100, r.sexo_bezerro, v_hoje - r.dias_parto);
    end if;

    v_criadas := v_criadas + 1;
  end loop;

  raise notice 'Fazenda Teste: % vaca(s) criada(s) (as que já existiam foram puladas).', v_criadas;
end;
$$;

-- conferência
select v.numero_identificacao as vaca, v.nome, v.status_produtivo, v.status_reprodutivo,
       v.data_parto,
       (select string_agg(c.data_cobertura || ' ' || c.diagnostico_prenhez, ' | ' order by c.data_cobertura)
        from coberturas c where c.vaca_id = v.id) as coberturas
from vacas v
join propriedades p on p.id = v.propriedade_id and p.nome_propriedade = 'Fazenda Teste'
where v.numero_identificacao between 101 and 109
order by v.numero_identificacao;

commit;
