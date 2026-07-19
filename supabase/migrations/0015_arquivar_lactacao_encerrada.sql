-- Arquivamento automático de lactação encerrada. Quando um novo parto fecha a
-- lactação anterior (registrar_parto), o controle_leite, as coberturas daquele
-- período e o próprio parto migram pra tabelas de histórico e saem das tabelas
-- principais — que é o que a aplicação consulta. Ficam guardados pra consulta
-- futura (relatório histórico, auditoria), só não aparecem mais no dia a dia.
--
-- Tabelas de histórico são cópias "burras" da estrutura original, sem foreign
-- key de volta pras tabelas principais — evita que o arquivamento de uma
-- lactação mais antiga trave por causa de uma referência a algo já arquivado
-- antes. RLS aqui é só leitura (a escrita acontece via função SECURITY DEFINER).

create table controle_leite_historico (
  id uuid primary key,
  vaca_id uuid not null,
  parto_id uuid not null,
  litros numeric not null,
  data_controle date not null,
  periodo text,
  created_at timestamptz not null default now(),
  arquivado_em timestamptz not null default now()
);

create table coberturas_historico (
  id uuid primary key,
  vaca_id uuid not null,
  data_cobertura date not null,
  diagnostico_prenhez text,
  touro_semen text,
  created_at timestamptz not null default now(),
  arquivado_em timestamptz not null default now()
);

create table partos_historico (
  id uuid primary key,
  vaca_id uuid not null,
  cobertura_id uuid,
  data_parto date not null,
  producao_total numeric,
  projecao_305 numeric,
  persistencia numeric,
  dias_em_aberto integer,
  iep integer,
  created_at timestamptz not null default now(),
  arquivado_em timestamptz not null default now()
);

alter table controle_leite_historico enable row level security;
alter table coberturas_historico enable row level security;
alter table partos_historico enable row level security;

create policy "usuario ve controle_leite_historico da propriedade"
  on controle_leite_historico for select
  using (
    exists (
      select 1 from vacas v
      join usuarios_propriedades up on up.propriedade_id = v.propriedade_id
      where v.id = controle_leite_historico.vaca_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario ve coberturas_historico da propriedade"
  on coberturas_historico for select
  using (
    exists (
      select 1 from vacas v
      join usuarios_propriedades up on up.propriedade_id = v.propriedade_id
      where v.id = coberturas_historico.vaca_id and up.usuario_id = auth.uid()
    )
  );

create policy "usuario ve partos_historico da propriedade"
  on partos_historico for select
  using (
    exists (
      select 1 from vacas v
      join usuarios_propriedades up on up.propriedade_id = v.propriedade_id
      where v.id = partos_historico.vaca_id and up.usuario_id = auth.uid()
    )
  );

-- registrar_parto ganha o passo de arquivamento logo depois de criar o parto novo
-- (precisa existir o vínculo novo de cobertura_id antes de decidir o que arquivar).
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
    insert into controle_leite_historico (id, vaca_id, parto_id, litros, data_controle, periodo, created_at)
    select id, vaca_id, parto_id, litros, data_controle, periodo, created_at
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
