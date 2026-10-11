-- Achados nos testes de 11/10/2026 (Fazenda Teste):
--
-- 1. Média/projeção do bot diferente da do site. O bot somava só o leite com parto_id = parto
--    ativo; o site soma o leite DA VACA com data a partir do parto ativo. Dado antigo (o bot, antes
--    da 0022, fechava a lactação só com ativa=false, sem arquivar) deixou leite da lactação atual
--    ligado ao parto anterior — a vaca 9 tinha 20 pesagens desde o parto e nenhuma "ligada" a ele.
--    Agora o bot conta como o site: leite da vaca entre a data do parto e hoje. Só é chamado pra
--    parto ativo (relatórios), então não pega leite de lactação seguinte.
--
-- 2. Parto duplicado: vacas com 3-4 partos em poucas semanas (IEP de 3, 9, 52 dias). Agora um
--    parto a menos de 240 dias de outro da mesma vaca é recusado (gestação de 283 dias; 240 deixa
--    folga pra parto prematuro). Se a data do parto anterior estava errada, corrige-se ela.

-- ============================================================
-- 1. indicadores da lactação (0027) com o leite da vaca desde o parto
-- ============================================================

create or replace function _indicadores_lactacao(p_parto_id uuid, p_hoje date default null) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoje date := coalesce(p_hoje, _hoje_fazenda());
  v_parto partos;
  v_n integer;
  v_total numeric;
  v_media numeric;
  v_recente numeric;
  v_anterior numeric;
  v_persistencia numeric;
  v_positiva date;
  v_ultima_data date;
  v_ultima numeric;
begin
  select * into v_parto from partos where id = p_parto_id;
  if v_parto.id is null then
    return null;
  end if;

  -- leite da VACA a partir do parto (mesma regra do site, src/lib/indicadores.ts), não pelo
  -- parto_id gravado, que pode estar ligado ao parto anterior em dado antigo
  with dias as (
    select data_controle as d, sum(litros) as l
    from controle_leite
    where vaca_id = v_parto.vaca_id and data_controle between v_parto.data_parto and v_hoje
    group by data_controle
  )
  select count(*), sum(l), avg(l),
         avg(l) filter (where d > v_hoje - 30),
         avg(l) filter (where d > v_hoje - 60 and d <= v_hoje - 30)
  into v_n, v_total, v_media, v_recente, v_anterior
  from dias;

  select data_controle, sum(litros) into v_ultima_data, v_ultima
  from controle_leite
  where vaca_id = v_parto.vaca_id and data_controle between v_parto.data_parto and v_hoje
  group by data_controle
  order by data_controle desc
  limit 1;

  if v_hoje - v_parto.data_parto >= 60 and v_recente is not null and v_anterior > 0 then
    v_persistencia := v_recente / v_anterior * 100;
  end if;

  select max(data_cobertura) into v_positiva
  from coberturas
  where vaca_id = v_parto.vaca_id and data_cobertura >= v_parto.data_parto and diagnostico_prenhez = 'positivo';

  return jsonb_build_object(
    'data_parto', v_parto.data_parto,
    'iep', v_parto.iep,
    'del', v_hoje - v_parto.data_parto,
    'dias_pesados', v_n,
    'litros', coalesce(v_total, 0),
    'media', v_media,
    'projecao_305', v_media * 305,
    'persistencia', v_persistencia,
    'dias_em_aberto', coalesce(v_positiva, v_hoje) - v_parto.data_parto,
    'aberto_fechado', v_positiva is not null,
    'ultima_data', v_ultima_data,
    'ultima_litros', v_ultima
  );
end;
$$;

revoke execute on function _indicadores_lactacao(uuid, date) from public, anon, authenticated;

-- ============================================================
-- 2. parto duplicado
-- ============================================================

-- Trigger (e não dentro de _registrar_parto) pra valer em qualquer caminho: site, bot, campo.
-- Na hora do insert o parto anterior ainda está em partos (registrar_parto só arquiva depois);
-- olha também partos_historico.
create or replace function _partos_recusar_duplicado() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perto date;
begin
  select d into v_perto
  from (
    select data_parto as d from partos where vaca_id = new.vaca_id and id <> new.id
    union all
    select data_parto from partos_historico where vaca_id = new.vaca_id
  ) x
  where abs(d - new.data_parto) < 240
  order by abs(d - new.data_parto)
  limit 1;

  if v_perto is not null then
    raise exception 'Essa vaca já tem parto registrado em % (só % dias de diferença). Se aquele parto foi lançado com a data errada, corrija a data dele em vez de lançar outro',
      to_char(v_perto, 'DD/MM/YYYY'), abs(v_perto - new.data_parto);
  end if;
  return new;
end;
$$;

revoke execute on function _partos_recusar_duplicado() from public, anon, authenticated;

drop trigger if exists partos_recusar_duplicado on partos;
create trigger partos_recusar_duplicado
  before insert on partos
  for each row execute function _partos_recusar_duplicado();
