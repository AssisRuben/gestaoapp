-- Habilita RLS em vacas (só SELECT — insert passa exclusivamente pela RPC abaixo,
-- que impõe as regras de numeração automática / duplicata / vínculo de bezerro
-- descritas no CLAUDE.md, regra 4).

alter table vacas enable row level security;

create policy "usuario ve vacas da propriedade"
  on vacas for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = vacas.propriedade_id
        and up.usuario_id = auth.uid()
    )
  );

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
declare
  v_numero integer;
  v_vaca vacas;
  v_bezerro_id uuid;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if p_numero_identificacao is null then
    select coalesce(max(numero_identificacao), 0) + 1 into v_numero
    from vacas where propriedade_id = p_propriedade_id;
  else
    v_numero := p_numero_identificacao;
    if exists (
      select 1 from vacas
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
    ) then
      raise exception 'já existe uma vaca com o número %', v_numero;
    end if;
  end if;

  insert into vacas (propriedade_id, mae_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (p_propriedade_id, p_mae_id, v_numero, p_status_produtivo, p_status_reprodutivo)
  returning * into v_vaca;

  if p_mae_id is not null then
    select id into v_bezerro_id from bezerros
    where mae_id = p_mae_id and vaca_id_gerada is null
    order by created_at desc limit 1;

    if v_bezerro_id is not null then
      update bezerros set vaca_id_gerada = v_vaca.id where id = v_bezerro_id;
    end if;
  end if;

  return v_vaca;
end;
$$;
