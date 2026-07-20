-- controle_leite não tem (e talvez nunca tenha tido, nesta instância) a coluna `periodo` que o
-- CLAUDE.md documenta como "ainda existe, só não é preenchida". Isso quebrava de verdade:
--
--   1. registrar_leite/atualizar_leite (0011_leite.sql) tentavam gravar em `periodo`, então TODA
--      chamada a essas funções vinha falhando com "column periodo does not exist" — o "Novo
--      registro" de leite do site provavelmente nunca salvou com sucesso.
--   2. registrar_parto (0015_arquivar_lactacao_encerrada.sql) tentava copiar `periodo` de
--      controle_leite pro histórico ao fechar uma lactação — quebrava o parto inteiro (não só o
--      arquivamento) assim que houvesse qualquer leite lançado na lactação sendo fechada.
--
-- Achado rodando supabase/tests/rpc_tests.sql. Corrige as três funções removendo a coluna do
-- INSERT/UPDATE/SELECT. Mantém os parâmetros p_periodo (nunca usados pelo site) só pra não
-- quebrar a assinatura de quem já chama essas funções; eles agora são ignorados.
-- controle_leite_historico mantém a coluna `periodo` (nullable, sempre null daqui pra frente) —
-- não vale a pena um ALTER TABLE só pra isso.

create or replace function registrar_leite(
  p_vaca_id uuid,
  p_litros numeric,
  p_data_controle date,
  p_periodo text default null
) returns controle_leite
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_parto_id uuid;
  v_registro controle_leite;
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

  select id into v_parto_id from partos
  where vaca_id = p_vaca_id and ativa = true
  order by data_parto desc limit 1;

  if v_parto_id is null then
    raise exception 'essa vaca não tem parto ativo — registre o parto antes de lançar leite';
  end if;

  insert into controle_leite (vaca_id, parto_id, litros, data_controle)
  values (p_vaca_id, v_parto_id, p_litros, p_data_controle)
  returning * into v_registro;

  return v_registro;
end;
$$;

create or replace function atualizar_leite(
  p_registro_id uuid,
  p_litros numeric,
  p_data_controle date,
  p_periodo text default null
) returns controle_leite
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_registro controle_leite;
begin
  select v.propriedade_id into v_propriedade_id
  from controle_leite c join vacas v on v.id = c.vaca_id
  where c.id = p_registro_id;

  if v_propriedade_id is null then
    raise exception 'registro não encontrado';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  update controle_leite set
    litros = p_litros,
    data_controle = p_data_controle
  where id = p_registro_id
  returning * into v_registro;

  return v_registro;
end;
$$;

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
  v_parto_anterior partos;
  v_iep integer;
  v_cobertura_id uuid;
  v_novo_parto partos;
  v_numero_bezerro integer;
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

  -- cobertura confirmada mais recente dessa vaca
  select id into v_cobertura_id from coberturas
  where vaca_id = p_vaca_id and diagnostico_prenhez = 'positivo'
  order by data_cobertura desc limit 1;

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
    insert into coberturas_historico (id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, created_at)
    select id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, created_at
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

  insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento)
  values (v_propriedade_id, v_novo_parto.id, p_vaca_id, v_numero_bezerro, p_sexo_bezerro, p_data_parto);

  return v_novo_parto;
end;
$$;
