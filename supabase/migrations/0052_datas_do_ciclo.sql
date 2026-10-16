-- Datas do ciclo conferidas na hora de gravar (15/10/2026, depois do caso da vaca 10 — 0051).
-- Mesmo tipo de erro do diagnóstico: o registro era aceito sem conferir se combina com o momento da
-- vaca, e o bot respondia "registrado" como se estivesse tudo certo. Vale pra site, bot e Lançar no
-- campo (todos passam por _registrar_cobertura / _registrar_parto).
--
-- Cobertura:
--   - data no futuro → recusa (o bot não conferia; o campo já conferia);
--   - data antes do último parto da vaca → recusa (nasce "velha": não aparece em pendência nenhuma
--     nem recebe diagnóstico — provável origem do caso da vaca 10, com o ano entendido errado);
--   - vaca prenhe (cobertura atual positiva) → recusa: ou o diagnóstico mudou (registre o negativo
--     antes) ou a data está errada.
-- Parto:
--   - data no futuro, ou no mesmo dia/antes do parto ativo → recusa (antes fechava a lactação atual
--     com IEP negativo);
--   - só liga a cobertura positiva DA LACTAÇÃO que está fechando (depois do parto anterior) e com
--     gestação plausível (240 a 310 dias). Antes ligava a positiva mais recente sem limite de data —
--     uma cobertura antiga solta (como a de 19/10/2025 da vaca 10) viraria pai/dose do próximo parto.
--   - o bot avisa quando havia cobertura positiva que ficou de fora por causa do intervalo.

create or replace function _registrar_cobertura(
  p_vaca_id uuid,
  p_data_cobertura date,
  p_touro_semen text,
  p_touro_id uuid,
  p_dose_programa boolean
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_touro_nome text;
  v_cobertura coberturas;
  v_parto_ativo date;
  v_prenhe coberturas_atuais;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if p_data_cobertura is null then
    raise exception 'informe a data da cobertura';
  end if;
  if p_data_cobertura > _hoje_fazenda() then
    raise exception 'a data da cobertura (%) é no futuro — confira o dia e o ano', _fmt_data(p_data_cobertura);
  end if;

  select max(data_parto) into v_parto_ativo from partos where vaca_id = p_vaca_id and ativa;
  if p_data_cobertura < v_parto_ativo then
    raise exception 'a data da cobertura (%) é antes do último parto da vaca (%) — confira o dia e o ano',
      _fmt_data(p_data_cobertura), _fmt_data(v_parto_ativo);
  end if;

  select * into v_prenhe from coberturas_atuais
  where vaca_id = p_vaca_id and diagnostico_prenhez = 'positivo' and data_cobertura <= p_data_cobertura;
  if v_prenhe.id is not null then
    raise exception 'a vaca está prenhe da cobertura de % (parto previsto para %). Se ela perdeu a prenhez, registre o diagnóstico negativo antes da cobertura nova',
      _fmt_data(v_prenhe.data_cobertura), _fmt_data(v_prenhe.data_cobertura + 283);
  end if;

  if p_dose_programa and p_touro_id is null then
    raise exception 'escolha o touro da dose do programa';
  end if;

  if p_touro_id is not null then
    select nome into v_touro_nome from touros where id = p_touro_id;
    if v_touro_nome is null then
      raise exception 'touro não encontrado';
    end if;
  end if;

  if p_dose_programa then
    perform _garantir_saldo_dose(v_propriedade_id, p_touro_id);
  end if;

  -- touro_semen continua preenchido (com o nome do catálogo quando não vier texto) porque é o
  -- campo que os relatórios do bot e as telas antigas mostram.
  insert into coberturas (vaca_id, data_cobertura, touro_semen, touro_id, dose_programa)
  values (
    p_vaca_id,
    p_data_cobertura,
    coalesce(nullif(p_touro_semen, ''), v_touro_nome),
    p_touro_id,
    coalesce(p_dose_programa, false)
  )
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;

revoke execute on function _registrar_cobertura(uuid, date, text, uuid, boolean) from public, anon, authenticated;

-- Corpo igual ao de 0022, com as conferências de data e a ligação da cobertura restrita.
create or replace function _registrar_parto(
  p_vaca_id uuid,
  p_data_parto date,
  p_numero_bezerro integer,
  p_sexo_bezerro text
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
  v_touro_id uuid;
  v_dose_programa boolean;
  v_novo_parto partos;
  v_numero_bezerro integer;
begin
  select propriedade_id into v_propriedade_id from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if p_data_parto is null then
    raise exception 'informe a data do parto';
  end if;
  if p_data_parto > _hoje_fazenda() then
    raise exception 'a data do parto (%) é no futuro — confira o dia e o ano', _fmt_data(p_data_parto);
  end if;

  -- fecha a lactação anterior (se existir) e calcula o IEP
  select * into v_parto_anterior
  from partos where vaca_id = p_vaca_id and ativa = true
  order by data_parto desc limit 1;

  if v_parto_anterior.id is not null and p_data_parto <= v_parto_anterior.data_parto then
    raise exception 'a data do parto (%) não é depois do último parto da vaca (%) — confira o dia e o ano',
      _fmt_data(p_data_parto), _fmt_data(v_parto_anterior.data_parto);
  end if;

  if v_parto_anterior.id is not null then
    v_iep := p_data_parto - v_parto_anterior.data_parto;
    update partos set ativa = false where id = v_parto_anterior.id;
  else
    v_iep := null;
  end if;

  -- cobertura positiva DESTA gestação: depois do parto anterior, ainda sem parto, e com intervalo
  -- de gestação plausível (240 a 310 dias). Fora disso o parto fica sem cobertura ligada.
  select c.id, c.touro_id, c.dose_programa into v_cobertura_id, v_touro_id, v_dose_programa
  from coberturas c
  where c.vaca_id = p_vaca_id and c.diagnostico_prenhez = 'positivo'
    and (v_parto_anterior.id is null or c.data_cobertura >= v_parto_anterior.data_parto)
    and p_data_parto - c.data_cobertura between 240 and 310
    and not exists (select 1 from partos p where p.cobertura_id = c.id)
    and not exists (select 1 from partos_historico ph where ph.cobertura_id = c.id)
  order by c.data_cobertura desc limit 1;

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
    insert into coberturas_historico (id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at)
    select id, vaca_id, data_cobertura, diagnostico_prenhez, touro_semen, touro_id, dose_programa, created_at
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

  insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento, touro_id, dose_programa)
  values (v_propriedade_id, v_novo_parto.id, p_vaca_id, v_numero_bezerro, p_sexo_bezerro, p_data_parto, v_touro_id, coalesce(v_dose_programa, false));

  return v_novo_parto;
end;
$$;

revoke execute on function _registrar_parto(uuid, date, integer, text) from public, anon, authenticated;

-- Bot (0022): igual, com o aviso de cobertura positiva que ficou de fora do parto.
create or replace function bot_registrar_parto(
  p_telefone text,
  p_numero_vaca integer,
  p_data_parto date,
  p_numero_bezerro integer default null,
  p_sexo_bezerro text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_vaca_id uuid;
  v_parto partos;
  v_bezerro bezerros;
  v_touro_nome text;
  v_sexo text := nullif(lower(trim(coalesce(p_sexo_bezerro, ''))), '');
  v_positiva coberturas_atuais;
  v_msg text;
begin
  v_propriedade_id := _propriedade_do_telefone(p_telefone);
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  select id into v_vaca_id from vacas
  where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_vaca;
  if v_vaca_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não encontrei a vaca %s no cadastro. Confira o número e mande de novo.', p_numero_vaca));
  end if;

  if v_sexo is not null and v_sexo not in ('macho', 'femea', 'natimorto') then
    v_sexo := null;
  end if;

  -- a gestação que este parto encerra, pra avisar se ela não puder ser ligada
  select * into v_positiva from coberturas_atuais
  where vaca_id = v_vaca_id and diagnostico_prenhez = 'positivo';

  begin
    v_parto := _registrar_parto(v_vaca_id, p_data_parto, p_numero_bezerro, v_sexo);
  exception when others then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não consegui registrar o parto da vaca %s: %s.', p_numero_vaca, sqlerrm));
  end;

  -- o bot gravava vacas.data_parto; os relatórios dele ainda podem ler esse campo
  update vacas set data_parto = p_data_parto where id = v_vaca_id;

  select * into v_bezerro from bezerros where parto_id = v_parto.id limit 1;
  select nome into v_touro_nome from touros where id = v_bezerro.touro_id;

  v_msg := format('Parto da vaca %s registrado em %s.', p_numero_vaca, to_char(p_data_parto, 'DD/MM/YYYY'));
  v_msg := v_msg || format(' %s número %s.',
    case v_bezerro.sexo when 'femea' then 'Bezerra' when 'macho' then 'Bezerro' when 'natimorto' then 'Natimorto' else 'Cria' end,
    v_bezerro.numero_identificacao);
  if v_bezerro.dose_programa then
    v_msg := v_msg || format(' Nascido de dose do programa (touro %s).', v_touro_nome);
  elsif v_touro_nome is not null then
    v_msg := v_msg || format(' Pai: touro %s.', v_touro_nome);
  end if;
  if v_parto.iep is not null then
    v_msg := v_msg || format(' Lactação anterior encerrada; intervalo entre partos: %s dias.', v_parto.iep);
  end if;
  if v_parto.cobertura_id is null and v_positiva.id is not null then
    v_msg := v_msg || format(' Atenção: a cobertura positiva de %s não foi ligada a este parto — são %s dias, fora do tempo normal de gestação (240 a 310). Confira as datas.',
      _fmt_data(v_positiva.data_cobertura), p_data_parto - v_positiva.data_cobertura);
  end if;

  return jsonb_build_object(
    'ok', true,
    'mensagem', v_msg,
    'numero_bezerro', v_bezerro.numero_identificacao,
    'iep', v_parto.iep,
    'dose_programa', v_bezerro.dose_programa
  );
end;
$$;

revoke execute on function bot_registrar_parto(text, integer, date, integer, text) from public, anon, authenticated;
grant execute on function bot_registrar_parto(text, integer, date, integer, text) to service_role;
