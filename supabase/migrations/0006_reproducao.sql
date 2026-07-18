-- Módulo de reprodução: coberturas + diagnóstico de prenhez.
-- Corrige por construção o bug conhecido do bot (regra 3 do CLAUDE.md): a atualização de
-- diagnóstico sempre mira uma cobertura específica por id, nunca um UPDATE em massa por vaca_id.

alter table coberturas add column if not exists touro_semen text;

alter table coberturas enable row level security;

create policy "usuario ve coberturas da propriedade"
  on coberturas for select
  using (
    exists (
      select 1 from vacas v
      join usuarios_propriedades up on up.propriedade_id = v.propriedade_id
      where v.id = coberturas.vaca_id and up.usuario_id = auth.uid()
    )
  );

create or replace function registrar_cobertura(
  p_vaca_id uuid,
  p_data_cobertura date,
  p_touro_semen text default null
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_cobertura coberturas;
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

  insert into coberturas (vaca_id, data_cobertura, touro_semen)
  values (p_vaca_id, p_data_cobertura, p_touro_semen)
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;

create or replace function atualizar_cobertura(
  p_cobertura_id uuid,
  p_data_cobertura date,
  p_touro_semen text default null,
  p_diagnostico_prenhez text default 'pendente'
) returns coberturas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_cobertura coberturas;
begin
  select v.propriedade_id into v_propriedade_id
  from coberturas c join vacas v on v.id = c.vaca_id
  where c.id = p_cobertura_id;

  if v_propriedade_id is null then
    raise exception 'cobertura não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if p_diagnostico_prenhez not in ('pendente', 'positivo', 'negativo') then
    raise exception 'diagnóstico inválido: %', p_diagnostico_prenhez;
  end if;

  -- update mira só esta cobertura por id, nunca todas as coberturas da vaca (ver regra 3)
  update coberturas set
    data_cobertura = p_data_cobertura,
    touro_semen = p_touro_semen,
    diagnostico_prenhez = p_diagnostico_prenhez
  where id = p_cobertura_id
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;
