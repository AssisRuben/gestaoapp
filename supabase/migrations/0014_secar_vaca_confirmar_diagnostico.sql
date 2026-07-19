-- Ações rápidas do Dashboard: confirmar secagem (marca a vaca como "seca") e
-- confirmar diagnóstico de prenhez pendente. Funções dedicadas em vez de
-- reaproveitar atualizar_vaca/atualizar_cobertura porque aquelas exigem
-- reenviar TODOS os campos (senão sobrescrevem mãe/status reprodutivo/touro
-- com os valores default) — aqui só o campo relevante muda.

create or replace function secar_vaca(p_vaca_id uuid) returns vacas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_status_atual text;
  v_vaca vacas;
begin
  select propriedade_id, status_produtivo into v_propriedade_id, v_status_atual
  from vacas where id = p_vaca_id;

  if v_propriedade_id is null then
    raise exception 'vaca não encontrada';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if v_status_atual <> 'lactacao' then
    raise exception 'só é possível secar uma vaca que está em lactação';
  end if;

  update vacas set status_produtivo = 'seca'
  where id = p_vaca_id
  returning * into v_vaca;

  return v_vaca;
end;
$$;

create or replace function confirmar_diagnostico(
  p_cobertura_id uuid,
  p_diagnostico_prenhez text
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

  if p_diagnostico_prenhez not in ('positivo', 'negativo') then
    raise exception 'diagnóstico inválido: %', p_diagnostico_prenhez;
  end if;

  -- mira só esta cobertura por id, nunca todas as coberturas da vaca (regra 3 do CLAUDE.md)
  update coberturas set diagnostico_prenhez = p_diagnostico_prenhez
  where id = p_cobertura_id
  returning * into v_cobertura;

  return v_cobertura;
end;
$$;
