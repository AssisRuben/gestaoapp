-- Controle de leite (regra 2 do CLAUDE.md): só é possível lançar leite se a vaca tiver um parto
-- com ativa=true. registrar_leite checa isso e devolve mensagem instrutiva em vez de deixar
-- estourar erro de constraint (parto_id é NOT NULL).

alter table controle_leite enable row level security;

create policy "usuario ve controle_leite da propriedade"
  on controle_leite for select
  using (
    exists (
      select 1 from vacas v
      join usuarios_propriedades up on up.propriedade_id = v.propriedade_id
      where v.id = controle_leite.vaca_id and up.usuario_id = auth.uid()
    )
  );

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

  insert into controle_leite (vaca_id, parto_id, litros, data_controle, periodo)
  values (p_vaca_id, v_parto_id, p_litros, p_data_controle, p_periodo)
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
    data_controle = p_data_controle,
    periodo = p_periodo
  where id = p_registro_id
  returning * into v_registro;

  return v_registro;
end;
$$;

create or replace function deletar_leite(p_registro_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
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

  delete from controle_leite where id = p_registro_id;
end;
$$;
