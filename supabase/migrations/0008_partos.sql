-- Registrar parto (regra 1 do CLAUDE.md): fecha a lactação anterior, calcula IEP, vincula a
-- cobertura confirmada mais recente, atualiza status da vaca e cria o bezerro (já com
-- numero_identificacao, sexo e data_nascimento, reaproveitando a mesma checagem de numeração
-- compartilhada com vacas/bezerros das outras funções).

alter table partos enable row level security;

create policy "usuario ve partos da propriedade"
  on partos for select
  using (
    exists (
      select 1 from vacas v
      join usuarios_propriedades up on up.propriedade_id = v.propriedade_id
      where v.id = partos.vaca_id and up.usuario_id = auth.uid()
    )
  );

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
