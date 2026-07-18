-- Edição de parto: escopo deliberadamente limitado à data do parto (o motivo mais comum de
-- correção é erro de digitação na data). Recalcula o IEP com base no parto cronologicamente
-- anterior dessa vaca (excluindo o próprio) e mantém a data_nascimento do bezerro gerado em
-- sincronia. NÃO reprocessa o flag `ativa` de outros partos da vaca (isso reordenaria todo o
-- histórico de lactação, com risco maior do que vale a pena pra uma correção simples de data).

create or replace function atualizar_parto(
  p_parto_id uuid,
  p_data_parto date
) returns partos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_vaca_id uuid;
  v_iep integer;
  v_parto_anterior_data date;
  v_parto partos;
begin
  select v.propriedade_id, p.vaca_id into v_propriedade_id, v_vaca_id
  from partos p join vacas v on v.id = p.vaca_id
  where p.id = p_parto_id;

  if v_propriedade_id is null then
    raise exception 'parto não encontrado';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  select max(data_parto) into v_parto_anterior_data
  from partos
  where vaca_id = v_vaca_id and id <> p_parto_id and data_parto < p_data_parto;

  if v_parto_anterior_data is not null then
    v_iep := p_data_parto - v_parto_anterior_data;
  else
    v_iep := null;
  end if;

  update partos set data_parto = p_data_parto, iep = v_iep
  where id = p_parto_id
  returning * into v_parto;

  update bezerros set data_nascimento = p_data_parto where parto_id = p_parto_id;

  return v_parto;
end;
$$;
