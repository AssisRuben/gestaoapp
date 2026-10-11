-- Bot do WhatsApp passa a usar o banco pra TODAS as escritas (antes só cobertura e parto, 0022).
-- Até aqui leite, diagnóstico, cadastro/correção de vaca e financeiro eram gravados direto nas
-- tabelas pelo n8n, com regras próprias que já divergiam do site:
--   - vaca nova pelo WhatsApp numerava só pelas vacas (o site usa o espaço compartilhado com os
--     bezerros) e podia pegar o número de um bezerro;
--   - corrigir/apagar leite pegava o primeiro registro da vaca no dia — com duas ordenhas, podia
--     mexer na errada;
--   - corrigir/apagar financeiro sem categoria nem data pegava o lançamento mais recente da fazenda.
--
-- Padrão igual a 0022: bot_* identificam a fazenda pelo telefone, chamam a mesma regra do site e
-- sempre devolvem {ok, mensagem} (nunca erro). Só a service role executa.
--
-- controle_leite.periodo volta a existir (opcional): o bot já perguntava manhã/tarde e respondia
-- "registrado (manhã)", mas o dado se perdia. Com ele dá pra saber qual ordenha corrigir/apagar.

alter table controle_leite add column if not exists periodo text;
alter table controle_leite drop constraint if exists controle_leite_periodo_check;
alter table controle_leite add constraint controle_leite_periodo_check
  check (periodo in ('manha', 'tarde', 'dia_inteiro'));

-- ============================================================
-- Auxiliares
-- ============================================================

create or replace function _hoje_fazenda() returns date
language sql
stable
as $$
  select (now() at time zone 'America/Fortaleza')::date;
$$;

create or replace function _periodo_valido(p_periodo text) returns text
language sql
immutable
as $$
  select case public._texto_comparavel(p_periodo)
    when 'manha' then 'manha'
    when 'tarde' then 'tarde'
    when 'diainteiro' then 'dia_inteiro'
    else null
  end;
$$;

create or replace function _rotulo_periodo(p_periodo text) returns text
language sql
immutable
as $$
  select case p_periodo
    when 'manha' then 'manhã'
    when 'tarde' then 'tarde'
    when 'dia_inteiro' then 'dia inteiro'
    else null
  end;
$$;

-- 12.5 → "12,5"; 14.0 → "14"
create or replace function _fmt_num(p_valor numeric) returns text
language sql
immutable
as $$
  select regexp_replace(replace(to_char(round(p_valor, 1), 'FM999999990.0'), '.', ','), ',0$', '');
$$;

-- 1234.5 → "R$ 1.234,50"
create or replace function _fmt_reais(p_valor numeric) returns text
language sql
immutable
as $$
  select 'R$ ' || translate(to_char(round(p_valor, 2), 'FM999,999,990.00'), ',.', '.,');
$$;

create or replace function _fmt_data(p_data date) returns text
language sql
immutable
as $$
  select to_char(p_data, 'DD/MM/YYYY');
$$;

-- Mesmo formato que o site e o prompt do bot usam: minúsculo, sem acento, espaços simples.
create or replace function _categoria_normalizada(p_categoria text) returns text
language sql
immutable
as $$
  select coalesce(nullif(
    regexp_replace(
      translate(lower(trim(coalesce(p_categoria, ''))),
        'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      '\s+', ' ', 'g'),
    ''), 'outros');
$$;

create or replace function _rotulo_status(p_status text) returns text
language sql
immutable
as $$
  select case p_status
    when 'novilha' then 'novilha'
    when 'lactacao' then 'em lactação'
    when 'seca' then 'seca'
    when 'vazia' then 'vazia'
    when 'prenhe' then 'prenhe'
    when 'vazia_em_servico' then 'vazia em serviço'
    else p_status
  end;
$$;

-- ============================================================
-- Leite: regra única (site e bot)
-- ============================================================

create or replace function _registrar_leite(
  p_vaca_id uuid,
  p_litros numeric,
  p_data_controle date,
  p_periodo text
) returns controle_leite
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parto partos;
  v_periodo text := _periodo_valido(p_periodo);
  v_registro controle_leite;
begin
  if p_litros is null or p_litros <= 0 or p_litros > 100 then
    raise exception 'quantidade de litros inválida (%)', coalesce(_fmt_num(p_litros), 'vazia');
  end if;

  if p_data_controle > _hoje_fazenda() then
    raise exception 'a data % ainda não chegou', _fmt_data(p_data_controle);
  end if;

  select * into v_parto from partos
  where vaca_id = p_vaca_id and ativa
  order by data_parto desc limit 1;

  if v_parto.id is null then
    raise exception 'essa vaca não tem parto ativo — registre o parto antes de lançar leite';
  end if;

  if p_data_controle < v_parto.data_parto then
    raise exception 'a data % é anterior ao parto atual dessa vaca (%)',
      _fmt_data(p_data_controle), _fmt_data(v_parto.data_parto);
  end if;

  if v_periodo is not null and exists (
    select 1 from controle_leite
    where vaca_id = p_vaca_id and data_controle = p_data_controle and periodo = v_periodo
  ) then
    raise exception 'já existe lançamento dessa vaca em % (%) — corrija o registro em vez de lançar de novo',
      _fmt_data(p_data_controle), _rotulo_periodo(v_periodo);
  end if;

  insert into controle_leite (vaca_id, parto_id, litros, data_controle, periodo)
  values (p_vaca_id, v_parto.id, p_litros, p_data_controle, v_periodo)
  returning * into v_registro;

  return v_registro;
end;
$$;

revoke execute on function _registrar_leite(uuid, numeric, date, text) from public, anon, authenticated;

-- Site: mesma assinatura de antes; p_periodo agora é gravado.
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

  return _registrar_leite(p_vaca_id, p_litros, p_data_controle, p_periodo);
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

  if p_litros is null or p_litros <= 0 or p_litros > 100 then
    raise exception 'quantidade de litros inválida (%)', coalesce(_fmt_num(p_litros), 'vazia');
  end if;

  if p_data_controle > _hoje_fazenda() then
    raise exception 'a data % ainda não chegou', _fmt_data(p_data_controle);
  end if;

  update controle_leite set
    litros = p_litros,
    data_controle = p_data_controle,
    periodo = _periodo_valido(p_periodo)
  where id = p_registro_id
  returning * into v_registro;

  return v_registro;
end;
$$;

-- ============================================================
-- Bot: leite
-- ============================================================

-- Acha UM registro de leite da vaca no dia. Com mais de uma ordenha no dia, usa o período falado;
-- se ainda assim não der pra saber qual, devolve ok=false listando as opções (nunca adivinha).
create or replace function _bot_achar_leite(
  p_propriedade_id uuid,
  p_numero_vaca integer,
  p_data date,
  p_periodo text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vaca_id uuid;
  v_data date := coalesce(p_data, _hoje_fazenda());
  v_periodo text := _periodo_valido(p_periodo);
  v_total integer;
  v_registro controle_leite;
  v_opcoes text;
begin
  select id into v_vaca_id from vacas
  where propriedade_id = p_propriedade_id and numero_identificacao = p_numero_vaca;
  if v_vaca_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', coalesce(p_numero_vaca::text, '(sem número)')));
  end if;

  select count(*) into v_total from controle_leite where vaca_id = v_vaca_id and data_controle = v_data;

  if v_total = 0 then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei lançamento de leite da vaca %s em %s.', p_numero_vaca, _fmt_data(v_data)));
  end if;

  if v_total = 1 then
    select * into v_registro from controle_leite where vaca_id = v_vaca_id and data_controle = v_data;
  elsif v_periodo is not null
    and (select count(*) from controle_leite where vaca_id = v_vaca_id and data_controle = v_data and periodo = v_periodo) = 1 then
    select * into v_registro from controle_leite
    where vaca_id = v_vaca_id and data_controle = v_data and periodo = v_periodo;
  else
    select string_agg(_fmt_num(litros) || ' L' || coalesce(' (' || _rotulo_periodo(periodo) || ')', ''), ', ' order by created_at)
    into v_opcoes
    from controle_leite where vaca_id = v_vaca_id and data_controle = v_data;
    return jsonb_build_object('ok', false, 'mensagem',
      format('A vaca %s tem %s lançamentos em %s: %s. Diga qual ordenha (manhã ou tarde) ou faça a correção pelo site.',
        p_numero_vaca, v_total, _fmt_data(v_data), v_opcoes));
  end if;

  return jsonb_build_object(
    'ok', true,
    'registro_id', v_registro.id,
    'numero_vaca', p_numero_vaca,
    'data_controle', v_registro.data_controle,
    'periodo', v_registro.periodo,
    'litros', v_registro.litros,
    'descricao', format('vaca %s, %s%s, %s L', p_numero_vaca, _fmt_data(v_registro.data_controle),
      coalesce(', ' || _rotulo_periodo(v_registro.periodo), ''), _fmt_num(v_registro.litros))
  );
end;
$$;

revoke execute on function _bot_achar_leite(uuid, integer, date, text) from public, anon, authenticated;

create or replace function bot_registrar_leite(
  p_telefone text,
  p_numero_vaca integer,
  p_litros numeric,
  p_data date default null,
  p_periodo text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_vaca_id uuid;
  v_data date := coalesce(p_data, _hoje_fazenda());
  v_registro controle_leite;
  v_total_dia numeric;
  v_msg text;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  select id into v_vaca_id from vacas
  where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_vaca;
  if v_vaca_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', coalesce(p_numero_vaca::text, '(sem número)')));
  end if;

  if p_litros is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não entendi quantos litros a vaca %s deu. Mande de novo, por exemplo: "vaca %s 12 litros".', p_numero_vaca, p_numero_vaca));
  end if;

  begin
    v_registro := _registrar_leite(v_vaca_id, p_litros, v_data, p_periodo);
  exception when others then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não registrei o leite da vaca %s: %s.', p_numero_vaca, sqlerrm));
  end;

  v_msg := format('Registrado %s L da vaca %s em %s%s.', _fmt_num(v_registro.litros), p_numero_vaca,
    _fmt_data(v_data), coalesce(' (' || _rotulo_periodo(v_registro.periodo) || ')', ''));

  select sum(litros) into v_total_dia from controle_leite where vaca_id = v_vaca_id and data_controle = v_data;
  if v_total_dia > v_registro.litros then
    v_msg := v_msg || format(' Total da vaca no dia: %s L.', _fmt_num(v_total_dia));
  end if;

  return jsonb_build_object('ok', true, 'mensagem', v_msg, 'registro_id', v_registro.id);
end;
$$;

create or replace function bot_corrigir_leite(
  p_telefone text,
  p_numero_vaca integer,
  p_data date,
  p_periodo text,
  p_litros numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_alvo jsonb;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if p_litros is null or p_litros <= 0 or p_litros > 100 then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o valor certo em litros. Mande de novo, por exemplo: "corrige o leite da vaca 10 de hoje pra 15 litros".');
  end if;

  v_alvo := _bot_achar_leite(v_propriedade_id, p_numero_vaca, p_data, p_periodo);
  if not (v_alvo->>'ok')::boolean then
    return v_alvo;
  end if;

  update controle_leite set litros = p_litros where id = (v_alvo->>'registro_id')::uuid;

  return jsonb_build_object('ok', true, 'mensagem',
    format('Leite corrigido (%s → %s L).', v_alvo->>'descricao', _fmt_num(p_litros)));
end;
$$;

-- 1ª etapa da exclusão: só localiza e devolve a pergunta de confirmação. Quem apaga é
-- bot_excluir_leite, depois do SIM (pendência no Redis, regra 6 do CLAUDE.md).
create or replace function bot_localizar_leite_exclusao(
  p_telefone text,
  p_numero_vaca integer,
  p_data date,
  p_periodo text
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_alvo jsonb;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  v_alvo := _bot_achar_leite(v_propriedade_id, p_numero_vaca, p_data, p_periodo);
  if not (v_alvo->>'ok')::boolean then
    return v_alvo;
  end if;

  return v_alvo || jsonb_build_object('mensagem',
    format('Confirma excluir o registro de leite (%s)? Responda SIM para confirmar ou NAO para cancelar.', v_alvo->>'descricao'));
end;
$$;

create or replace function bot_excluir_leite(p_telefone text, p_registro_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_numero integer;
  v_registro controle_leite;
begin
  select c.* into v_registro
  from controle_leite c join vacas v on v.id = c.vaca_id
  where c.id = p_registro_id and v.propriedade_id = v_propriedade_id;

  if v_propriedade_id is null or v_registro.id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Esse registro de leite não existe mais (pode já ter sido excluído).');
  end if;

  select numero_identificacao into v_numero from vacas where id = v_registro.vaca_id;
  delete from controle_leite where id = p_registro_id;

  return jsonb_build_object('ok', true, 'mensagem',
    format('Registro de leite excluído (vaca %s, %s%s, %s L).', v_numero, _fmt_data(v_registro.data_controle),
      coalesce(', ' || _rotulo_periodo(v_registro.periodo), ''), _fmt_num(v_registro.litros)));
end;
$$;

-- ============================================================
-- Bot: diagnóstico de prenhez
-- ============================================================

-- Mira só a cobertura mais recente da vaca (regra 3 do CLAUDE.md). O status da vaca é ajustado
-- pelo trigger de 0024.
create or replace function bot_diagnosticar_prenhez(
  p_telefone text,
  p_numero_vaca integer,
  p_resultado text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_resultado text := _texto_comparavel(p_resultado);
  v_vaca_id uuid;
  v_cobertura coberturas;
  v_parto_previsto date;
  v_msg text;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if v_resultado not in ('positivo', 'negativo', 'pendente') then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o resultado do diagnóstico. Diga se a vaca está prenhe (positivo) ou vazia (negativo).');
  end if;

  select id into v_vaca_id from vacas
  where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_vaca;
  if v_vaca_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', coalesce(p_numero_vaca::text, '(sem número)')));
  end if;

  select * into v_cobertura from coberturas
  where vaca_id = v_vaca_id
  order by data_cobertura desc, created_at desc
  limit 1;

  if v_cobertura.id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('A vaca %s não tem cobertura registrada. Registre a cobertura (data e touro) antes do diagnóstico.', p_numero_vaca));
  end if;

  update coberturas set diagnostico_prenhez = v_resultado where id = v_cobertura.id;

  v_msg := format('Diagnóstico da vaca %s (cobertura de %s) registrado como %s.',
    p_numero_vaca, _fmt_data(v_cobertura.data_cobertura), v_resultado);

  if v_resultado = 'positivo' then
    v_parto_previsto := v_cobertura.data_cobertura + 283;
    v_msg := v_msg || format(' Parto previsto para %s; secar a partir de %s.',
      _fmt_data(v_parto_previsto), _fmt_data(v_parto_previsto - 60));
  elsif v_resultado = 'negativo' then
    v_msg := v_msg || ' A vaca volta pra lista de vazias.';
  end if;

  return jsonb_build_object('ok', true, 'mensagem', v_msg);
end;
$$;

-- ============================================================
-- Vacas: cadastro com a regra do site (numeração compartilhada com bezerros)
-- ============================================================

create or replace function _cadastrar_vaca(
  p_propriedade_id uuid,
  p_numero_identificacao integer,
  p_mae_id uuid,
  p_status_produtivo text,
  p_status_reprodutivo text
) returns vacas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_vaca vacas;
  v_bezerro_id uuid;
begin
  if p_numero_identificacao is null then
    select coalesce(greatest(
      (select max(numero_identificacao) from vacas where propriedade_id = p_propriedade_id),
      (select max(numero_identificacao) from bezerros where propriedade_id = p_propriedade_id)
    ), 0) + 1 into v_numero;
  else
    v_numero := p_numero_identificacao;
    -- bezerro com esse número ainda sem vínculo não é conflito: é a promoção esperada
    if exists (
      select 1 from vacas
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
    ) or exists (
      select 1 from bezerros
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
        and vaca_id_gerada is not null
    ) then
      raise exception 'já existe uma vaca com o número %', v_numero;
    end if;
  end if;

  insert into vacas (propriedade_id, mae_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (p_propriedade_id, p_mae_id, v_numero, p_status_produtivo, p_status_reprodutivo)
  returning * into v_vaca;

  if p_mae_id is not null then
    select id into v_bezerro_id from bezerros
    where mae_id = p_mae_id and numero_identificacao = v_numero and vaca_id_gerada is null
    limit 1;

    if v_bezerro_id is null then
      select id into v_bezerro_id from bezerros
      where mae_id = p_mae_id and vaca_id_gerada is null
      order by created_at desc limit 1;
    end if;

    if v_bezerro_id is not null then
      update bezerros set vaca_id_gerada = v_vaca.id where id = v_bezerro_id;
    end if;
  end if;

  return v_vaca;
end;
$$;

revoke execute on function _cadastrar_vaca(uuid, integer, uuid, text, text) from public, anon, authenticated;

-- Site: mesma assinatura e comportamento de 0005, agora delegando pra regra única.
create or replace function cadastrar_vaca(
  p_propriedade_id uuid,
  p_numero_identificacao integer default null,
  p_mae_id uuid default null,
  p_status_produtivo text default 'novilha',
  p_status_reprodutivo text default 'vazia'
) returns vacas
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  return _cadastrar_vaca(p_propriedade_id, p_numero_identificacao, p_mae_id,
    p_status_produtivo, p_status_reprodutivo);
end;
$$;

create or replace function bot_cadastrar_vaca(
  p_telefone text,
  p_numero_vaca integer,
  p_numero_mae integer,
  p_origem text,
  p_status_produtivo text,
  p_status_reprodutivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_comprada boolean := _texto_comparavel(p_origem) = 'comprada';
  v_mae_id uuid;
  v_produtivo text := case when p_status_produtivo in ('novilha', 'lactacao', 'seca') then p_status_produtivo else 'novilha' end;
  v_reprodutivo text := case when p_status_reprodutivo in ('vazia', 'prenhe', 'vazia_em_servico') then p_status_reprodutivo else 'vazia' end;
  v_vaca vacas;
  v_vinculou boolean;
  v_msg text;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  -- mãe de animal comprado não está nesta fazenda: nunca vincula
  if p_numero_mae is not null and not v_comprada then
    select id into v_mae_id from vacas
    where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_mae;
  end if;

  begin
    v_vaca := _cadastrar_vaca(v_propriedade_id, p_numero_vaca, v_mae_id, v_produtivo, v_reprodutivo);
  exception when others then
    if sqlerrm ilike 'já existe uma vaca%' then
      return jsonb_build_object('ok', false, 'mensagem',
        format('A vaca %s já está cadastrada nessa propriedade.', p_numero_vaca));
    end if;
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não consegui cadastrar a vaca: %s.', sqlerrm));
  end;

  v_vinculou := exists (select 1 from bezerros where vaca_id_gerada = v_vaca.id);

  v_msg := format('Vaca %s%s cadastrada (%s).', v_vaca.numero_identificacao,
    case when p_numero_vaca is null then ' (número gerado automaticamente)' else '' end,
    _rotulo_status(v_produtivo));
  if v_mae_id is not null then
    v_msg := v_msg || format(' Filha da vaca %s%s.', p_numero_mae,
      case when v_vinculou then ', vinculada ao registro de nascimento' else '' end);
  elsif p_numero_mae is not null and not v_comprada then
    v_msg := v_msg || format(' Não achei a vaca %s pra registrar como mãe — cadastrei sem mãe. Corrija pelo site se precisar.', p_numero_mae);
  end if;

  return jsonb_build_object('ok', true, 'mensagem', v_msg, 'numero', v_vaca.numero_identificacao);
end;
$$;

create or replace function bot_atualizar_vaca(
  p_telefone text,
  p_numero_vaca integer,
  p_status_produtivo text,
  p_status_reprodutivo text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_produtivo text := case when p_status_produtivo in ('novilha', 'lactacao', 'seca') then p_status_produtivo end;
  v_reprodutivo text := case when p_status_reprodutivo in ('vazia', 'prenhe', 'vazia_em_servico') then p_status_reprodutivo end;
  v_vaca vacas;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if v_produtivo is null and v_reprodutivo is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o que mudar. Diga, por exemplo: "a vaca 7 secou" ou "a vaca 7 está prenhe".');
  end if;

  update vacas set
    status_produtivo = coalesce(v_produtivo, status_produtivo),
    status_reprodutivo = coalesce(v_reprodutivo, status_reprodutivo)
  where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_vaca
  returning * into v_vaca;

  if v_vaca.id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', coalesce(p_numero_vaca::text, '(sem número)')));
  end if;

  return jsonb_build_object('ok', true, 'mensagem',
    format('Vaca %s atualizada: %s, %s.', p_numero_vaca,
      _rotulo_status(v_vaca.status_produtivo), _rotulo_status(v_vaca.status_reprodutivo)));
end;
$$;

-- ============================================================
-- Bot: financeiro
-- ============================================================

create or replace function bot_registrar_financeiro(
  p_telefone text,
  p_tipo text,
  p_valor numeric,
  p_categoria text,
  p_data date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_tipo text := _texto_comparavel(p_tipo);
  v_categoria text := _categoria_normalizada(p_categoria);
  v_data date := coalesce(p_data, _hoje_fazenda());
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if v_tipo not in ('despesa', 'receita') then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi se foi um gasto (despesa) ou um recebimento (receita). Mande de novo, por exemplo: "gastei 200 reais com ração".');
  end if;

  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o valor. Mande de novo com o valor em reais, por exemplo: "vendi 500 reais de leite".');
  end if;

  insert into financeiro (propriedade_id, tipo, categoria, valor, data)
  values (v_propriedade_id, v_tipo, v_categoria, p_valor, v_data);

  return jsonb_build_object('ok', true, 'mensagem',
    format('Lançada %s de %s (%s) em %s.', v_tipo, _fmt_reais(p_valor), v_categoria, _fmt_data(v_data)));
end;
$$;

-- Lançamento alvo de correção/exclusão: exige categoria ou data (antes, sem nenhum dos dois, o bot
-- pegava o lançamento mais recente da fazenda inteira). Com vários candidatos, o mais recente.
create or replace function _bot_achar_financeiro(
  p_propriedade_id uuid,
  p_tipo text,
  p_categoria text,
  p_data date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tipo text := nullif(_texto_comparavel(p_tipo), '');
  v_categoria text := case when nullif(trim(coalesce(p_categoria, '')), '') is null then null else _categoria_normalizada(p_categoria) end;
  v_alvo financeiro;
begin
  if v_categoria is null and p_data is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Me diga a categoria ou a data do lançamento, por exemplo: "o de ração de ontem".');
  end if;

  select * into v_alvo from financeiro f
  where f.propriedade_id = p_propriedade_id
    and (v_tipo is null or f.tipo = v_tipo)
    and (v_categoria is null or _categoria_normalizada(f.categoria) = v_categoria)
    and (p_data is null or f.data = p_data)
  order by f.created_at desc
  limit 1;

  if v_alvo.id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei lançamento%s%s. Confira a categoria e a data.',
        coalesce(' de ' || v_categoria, ''), coalesce(' em ' || _fmt_data(p_data), '')));
  end if;

  return jsonb_build_object(
    'ok', true,
    'lancamento_id', v_alvo.id,
    'tipo_financeiro', v_alvo.tipo,
    'categoria', v_alvo.categoria,
    'valor', v_alvo.valor,
    'data', v_alvo.data,
    'descricao', format('%s de %s, %s, %s', v_alvo.tipo, coalesce(v_alvo.categoria, 'outros'),
      _fmt_reais(v_alvo.valor), _fmt_data(v_alvo.data))
  );
end;
$$;

revoke execute on function _bot_achar_financeiro(uuid, text, text, date) from public, anon, authenticated;

create or replace function bot_corrigir_financeiro(
  p_telefone text,
  p_tipo text,
  p_categoria text,
  p_data date,
  p_valor numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_alvo jsonb;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if p_valor is null or p_valor <= 0 then
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o valor certo. Mande de novo, por exemplo: "corrige a despesa de ração de hoje pra 250".');
  end if;

  v_alvo := _bot_achar_financeiro(v_propriedade_id, p_tipo, p_categoria, p_data);
  if not (v_alvo->>'ok')::boolean then
    return v_alvo;
  end if;

  update financeiro set valor = p_valor where id = (v_alvo->>'lancamento_id')::uuid;

  return jsonb_build_object('ok', true, 'mensagem',
    format('Lançamento corrigido (%s → %s).', v_alvo->>'descricao', _fmt_reais(p_valor)));
end;
$$;

create or replace function bot_localizar_financeiro_exclusao(
  p_telefone text,
  p_tipo text,
  p_categoria text,
  p_data date
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_alvo jsonb;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  v_alvo := _bot_achar_financeiro(v_propriedade_id, p_tipo, p_categoria, p_data);
  if not (v_alvo->>'ok')::boolean then
    return v_alvo;
  end if;

  return v_alvo || jsonb_build_object('mensagem',
    format('Confirma excluir o lançamento (%s)? Responda SIM para confirmar ou NAO para cancelar.', v_alvo->>'descricao'));
end;
$$;

create or replace function bot_excluir_financeiro(p_telefone text, p_lancamento_id uuid) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_alvo financeiro;
begin
  delete from financeiro
  where id = p_lancamento_id and propriedade_id = v_propriedade_id
  returning * into v_alvo;

  if v_alvo.id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Esse lançamento não existe mais (pode já ter sido excluído).');
  end if;

  return jsonb_build_object('ok', true, 'mensagem',
    format('Lançamento excluído (%s de %s, %s, %s).', v_alvo.tipo, coalesce(v_alvo.categoria, 'outros'),
      _fmt_reais(v_alvo.valor), _fmt_data(v_alvo.data)));
end;
$$;

-- ============================================================
-- Permissões: só a service role (n8n) chama as funções do bot
-- ============================================================

do $$
declare
  v_assinatura text;
begin
  foreach v_assinatura in array array[
    'bot_registrar_leite(text, integer, numeric, date, text)',
    'bot_corrigir_leite(text, integer, date, text, numeric)',
    'bot_localizar_leite_exclusao(text, integer, date, text)',
    'bot_excluir_leite(text, uuid)',
    'bot_diagnosticar_prenhez(text, integer, text)',
    'bot_cadastrar_vaca(text, integer, integer, text, text, text)',
    'bot_atualizar_vaca(text, integer, text, text)',
    'bot_registrar_financeiro(text, text, numeric, text, date)',
    'bot_corrigir_financeiro(text, text, text, date, numeric)',
    'bot_localizar_financeiro_exclusao(text, text, text, date)',
    'bot_excluir_financeiro(text, uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_assinatura);
    execute format('grant execute on function %s to service_role', v_assinatura);
  end loop;
end $$;
