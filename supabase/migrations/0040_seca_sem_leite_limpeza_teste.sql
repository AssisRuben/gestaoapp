-- 1. Vaca SECA não recebe leite (decisão de 11/10/2026). Antes bastava ter parto ativo — e a
--    secagem não fecha a lactação, então vaca seca aceitava lançamento (site, bot e pesagem). Se a
--    secagem foi marcada por engano, volta-se o status da vaca pra "lactacao".
--
-- 2. Limpeza da Fazenda Teste (autorizada pelo usuário): vacas 1 e 4 tinham 3-4 partos em poucas
--    semanas, sobra de testes antigos (IEP gravado de 3, 9 e 52 dias). Fica só o parto ativo; o
--    leite ligado aos duplicados passa pro parto ativo (ou sai, se for de antes dele) e o IEP do
--    parto ativo é recalculado. Não faz nada em outro banco (homologação, banco do zero).

-- ============================================================
-- 1. _registrar_leite (0025) + vaca seca
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
  v_status text;
begin
  if p_litros is null or p_litros <= 0 or p_litros > 100 then
    raise exception 'quantidade de litros inválida (%)', coalesce(_fmt_num(p_litros), 'vazia');
  end if;

  if p_data_controle > _hoje_fazenda() then
    raise exception 'a data % ainda não chegou', _fmt_data(p_data_controle);
  end if;

  select status_produtivo into v_status from vacas where id = p_vaca_id;
  if v_status = 'seca' then
    raise exception 'essa vaca está seca — não recebe lançamento de leite. Se ela foi marcada como seca por engano, volte o status dela pra lactação';
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

-- ============================================================
-- 2. Fazenda Teste: partos duplicados das vacas 1 e 4
-- ============================================================

do $$
declare
  v_vaca record;
  v_ativo partos;
  v_dup uuid;
  v_anterior date;
begin
  for v_vaca in
    select id from vacas
    where propriedade_id = '5e6f5a6d-dd44-49e6-96af-4a5f8ff587fd' and numero_identificacao in (1, 4)
  loop
    select * into v_ativo from partos where vaca_id = v_vaca.id and ativa order by data_parto desc limit 1;
    continue when v_ativo.id is null;

    for v_dup in
      select id from partos
      where vaca_id = v_vaca.id and not ativa and abs(data_parto - v_ativo.data_parto) < 240
    loop
      update controle_leite set parto_id = v_ativo.id
      where parto_id = v_dup and data_controle >= v_ativo.data_parto;
      delete from controle_leite where parto_id = v_dup;
      update bezerros set parto_id = null where parto_id = v_dup;
      delete from partos where id = v_dup;
    end loop;

    -- IEP de verdade: parto anterior que sobrou (tabela ou histórico), senão primeiro parto
    select max(d) into v_anterior from (
      select data_parto as d from partos where vaca_id = v_vaca.id and id <> v_ativo.id
      union all
      select data_parto from partos_historico where vaca_id = v_vaca.id
    ) x where d < v_ativo.data_parto;
    update partos set iep = v_ativo.data_parto - v_anterior where id = v_ativo.id;
  end loop;
end $$;
