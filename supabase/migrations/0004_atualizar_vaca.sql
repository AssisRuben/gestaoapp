-- Edição de vaca existente, mesmo padrão de segurança de cadastrar_vaca: SECURITY DEFINER com
-- checagem explícita de acesso à propriedade (a vaca não tem policy de UPDATE direta, todo
-- update passa por aqui pra manter a checagem de número duplicado).

create or replace function atualizar_vaca(
  p_vaca_id uuid,
  p_numero_identificacao integer,
  p_mae_id uuid default null,
  p_status_produtivo text default 'novilha',
  p_status_reprodutivo text default 'vazia'
) returns vacas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_vaca vacas;
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

  if exists (
    select 1 from vacas
    where propriedade_id = v_propriedade_id
      and numero_identificacao = p_numero_identificacao
      and id <> p_vaca_id
  ) then
    raise exception 'já existe uma vaca com o número %', p_numero_identificacao;
  end if;

  update vacas set
    numero_identificacao = p_numero_identificacao,
    mae_id = p_mae_id,
    status_produtivo = p_status_produtivo,
    status_reprodutivo = p_status_reprodutivo
  where id = p_vaca_id
  returning * into v_vaca;

  return v_vaca;
end;
$$;
