-- numero_identificacao é um espaço compartilhado entre vacas e bezerros (o número do brinco
-- não muda quando o bezerro vira vaca adulta — é o mesmo número, só a tabela que muda). Este
-- migration:
--   1) corrige cadastrar_vaca/atualizar_vaca pra considerar bezerros na checagem de duplicata
--      e no cálculo do auto-número (bug: antes só olhavam a tabela vacas)
--   2) adiciona cadastrar_bezerro / atualizar_bezerro, mesmo padrão de segurança

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
    select coalesce(greatest(
      (select max(numero_identificacao) from vacas where propriedade_id = p_propriedade_id),
      (select max(numero_identificacao) from bezerros where propriedade_id = p_propriedade_id)
    ), 0) + 1 into v_numero;
  else
    v_numero := p_numero_identificacao;
    -- conflito real: outra vaca já tem esse número, ou um bezerro com esse número já foi
    -- vinculado a outra vaca. Um bezerro com esse número ainda SEM vínculo não é conflito —
    -- é exatamente o caminho esperado de promoção (ver busca por número abaixo).
    if exists (
      select 1 from vacas
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
    ) or exists (
      select 1 from bezerros
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
        and vaca_id_gerada is not null
    ) then
      raise exception 'já existe uma vaca com o número %', v_numero;
    end if;
  end if;

  insert into vacas (propriedade_id, mae_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (p_propriedade_id, p_mae_id, v_numero, p_status_produtivo, p_status_reprodutivo)
  returning * into v_vaca;

  if p_mae_id is not null then
    select id into v_bezerro_id from bezerros
    where mae_id = p_mae_id and numero_identificacao = v_numero and vaca_id_gerada is null
    limit 1;

    if v_bezerro_id is null then
      select id into v_bezerro_id from bezerros
      where mae_id = p_mae_id and vaca_id_gerada is null
      order by created_at desc limit 1;
    end if;

    if v_bezerro_id is not null then
      update bezerros set vaca_id_gerada = v_vaca.id where id = v_bezerro_id;
    end if;
  end if;

  return v_vaca;
end;
$$;

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
  ) or exists (
    select 1 from bezerros
    where propriedade_id = v_propriedade_id
      and numero_identificacao = p_numero_identificacao
      and vaca_id_gerada is not null
      and vaca_id_gerada <> p_vaca_id
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

create or replace function cadastrar_bezerro(
  p_propriedade_id uuid,
  p_numero_identificacao integer default null,
  p_mae_id uuid default null,
  p_sexo text default null,
  p_data_nascimento date default null
) returns bezerros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_bezerro bezerros;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if p_numero_identificacao is null then
    select coalesce(greatest(
      (select max(numero_identificacao) from vacas where propriedade_id = p_propriedade_id),
      (select max(numero_identificacao) from bezerros where propriedade_id = p_propriedade_id)
    ), 0) + 1 into v_numero;
  else
    v_numero := p_numero_identificacao;
    -- pra um bezerro NOVO, qualquer vaca ou bezerro (vinculado ou não) com esse número já é
    -- conflito — dois bezerros vivos não podem dividir o mesmo brinco.
    if exists (
      select 1 from vacas
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
    ) or exists (
      select 1 from bezerros
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
    ) then
      raise exception 'já existe um animal com o número %', v_numero;
    end if;
  end if;

  insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
  values (p_propriedade_id, p_mae_id, v_numero, p_sexo, p_data_nascimento)
  returning * into v_bezerro;

  return v_bezerro;
end;
$$;

create or replace function atualizar_bezerro(
  p_bezerro_id uuid,
  p_numero_identificacao integer,
  p_mae_id uuid default null,
  p_sexo text default null,
  p_data_nascimento date default null
) returns bezerros
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_bezerro bezerros;
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

  if exists (
    select 1 from vacas
    where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_identificacao
  ) or exists (
    select 1 from bezerros
    where propriedade_id = v_propriedade_id
      and numero_identificacao = p_numero_identificacao
      and id <> p_bezerro_id
  ) then
    raise exception 'já existe um animal com o número %', p_numero_identificacao;
  end if;

  update bezerros set
    numero_identificacao = p_numero_identificacao,
    mae_id = p_mae_id,
    sexo = p_sexo,
    data_nascimento = p_data_nascimento
  where id = p_bezerro_id
  returning * into v_bezerro;

  return v_bezerro;
end;
$$;

-- RLS: bezerros ainda não tinha (igual vacas, deixado pra quando o módulo fosse construído).
-- Só SELECT direto — insert/update passam pelas funções acima.
alter table bezerros enable row level security;

create policy "usuario ve bezerros da propriedade"
  on bezerros for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = bezerros.propriedade_id
        and up.usuario_id = auth.uid()
    )
  );
