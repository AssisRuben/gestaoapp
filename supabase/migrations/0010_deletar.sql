-- Exclusão (regra 6 do CLAUDE.md: sempre com confirmação antes — o front-end trata isso, aqui
-- só a função). SECURITY DEFINER com checagem de acesso, mesmo padrão das outras funções.
-- Se existir algo dependente (FK), o Postgres recusa a exclusão (foreign_key_violation) e a
-- função devolve uma mensagem amigável em vez do erro cru do banco.

create or replace function deletar_vaca(p_vaca_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
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

  begin
    delete from vacas where id = p_vaca_id;
  exception
    when foreign_key_violation then
      raise exception 'não é possível excluir: essa vaca tem coberturas, partos, leite ou bezerros vinculados';
  end;
end;
$$;

create or replace function deletar_bezerro(p_bezerro_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
begin
  select propriedade_id into v_propriedade_id from bezerros where id = p_bezerro_id;

  if v_propriedade_id is null then
    raise exception 'bezerro não encontrado';
  end if;

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  delete from bezerros where id = p_bezerro_id;
end;
$$;

create or replace function deletar_cobertura(p_cobertura_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
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

  begin
    delete from coberturas where id = p_cobertura_id;
  exception
    when foreign_key_violation then
      raise exception 'não é possível excluir: existe um parto vinculado a essa cobertura';
  end;
end;
$$;

create or replace function deletar_parto(p_parto_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
begin
  select v.propriedade_id into v_propriedade_id
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

  begin
    delete from partos where id = p_parto_id;
  exception
    when foreign_key_violation then
      raise exception 'não é possível excluir: esse parto tem leite ou bezerro vinculados';
  end;
end;
$$;
