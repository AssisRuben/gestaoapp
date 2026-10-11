-- Visitas técnicas: o que o técnico viu e recomendou em cada visita, e o acompanhamento das
-- recomendações (feita / em aberto) até a visita seguinte. Aparece no relatório da visita
-- (/relatorio, que imprime/salva PDF) e no resumo da fazenda do gestor.
--
-- Escrita só pelas funções abaixo (quem tem vínculo com a fazenda: produtor ou técnico). O nome de
-- quem registrou fica gravado na visita (autor_nome), pra continuar aparecendo mesmo se o técnico
-- perder o acesso depois. Leitura direta liberada por RLS pra quem tem vínculo.

create table if not exists visitas (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  data_visita date not null,
  observacoes text,
  autor_id uuid references auth.users(id) on delete set null,
  autor_nome text,
  created_at timestamptz not null default now()
);

create table if not exists recomendacoes (
  id uuid primary key default gen_random_uuid(),
  visita_id uuid not null references visitas(id) on delete cascade,
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  texto text not null check (length(trim(texto)) > 0),
  prazo date,
  concluida_em date,
  concluida_por_nome text,
  created_at timestamptz not null default now()
);

create index if not exists idx_visitas_propriedade on visitas (propriedade_id, data_visita desc);
create index if not exists idx_recomendacoes_propriedade on recomendacoes (propriedade_id, concluida_em);

alter table visitas enable row level security;
alter table recomendacoes enable row level security;

drop policy if exists "vinculo ve visitas" on visitas;
create policy "vinculo ve visitas" on visitas for select using (
  exists (select 1 from usuarios_propriedades up where up.propriedade_id = visitas.propriedade_id and up.usuario_id = auth.uid())
);
drop policy if exists "vinculo ve recomendacoes" on recomendacoes;
create policy "vinculo ve recomendacoes" on recomendacoes for select using (
  exists (select 1 from usuarios_propriedades up where up.propriedade_id = recomendacoes.propriedade_id and up.usuario_id = auth.uid())
);

create or replace function _nome_do_usuario_atual() returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(_nome_usuario(u.raw_user_meta_data), u.email::text)
  from auth.users u where u.id = auth.uid();
$$;

revoke execute on function _nome_do_usuario_atual() from public, anon, authenticated;

-- p_recomendacoes: uma por item (vazias são ignoradas)
create or replace function registrar_visita(
  p_propriedade_id uuid,
  p_data_visita date,
  p_observacoes text,
  p_recomendacoes text[],
  p_prazo date default null
) returns visitas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visita visitas;
  v_texto text;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if p_data_visita is null or p_data_visita > _hoje_fazenda() then
    raise exception 'data da visita inválida';
  end if;

  if nullif(trim(coalesce(p_observacoes, '')), '') is null
     and not exists (select 1 from unnest(coalesce(p_recomendacoes, '{}')) t where trim(t) <> '') then
    raise exception 'escreva as observações ou pelo menos uma recomendação';
  end if;

  insert into visitas (propriedade_id, data_visita, observacoes, autor_id, autor_nome)
  values (p_propriedade_id, p_data_visita, nullif(trim(coalesce(p_observacoes, '')), ''), auth.uid(), _nome_do_usuario_atual())
  returning * into v_visita;

  foreach v_texto in array coalesce(p_recomendacoes, '{}') loop
    if trim(v_texto) <> '' then
      insert into recomendacoes (visita_id, propriedade_id, texto, prazo)
      values (v_visita.id, p_propriedade_id, trim(v_texto), p_prazo);
    end if;
  end loop;

  return v_visita;
end;
$$;

-- Marca/desmarca uma recomendação como feita (produtor ou técnico da fazenda).
create or replace function concluir_recomendacao(p_recomendacao_id uuid, p_concluida boolean) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
begin
  select propriedade_id into v_propriedade_id from recomendacoes where id = p_recomendacao_id;
  if v_propriedade_id is null or not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_propriedade_id
  ) then
    raise exception 'recomendação não encontrada';
  end if;

  update recomendacoes set
    concluida_em = case when p_concluida then _hoje_fazenda() end,
    concluida_por_nome = case when p_concluida then _nome_do_usuario_atual() end
  where id = p_recomendacao_id;
end;
$$;

-- Só quem registrou a visita pode excluí-la (leva junto as recomendações).
create or replace function excluir_visita(p_visita_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from visitas where id = p_visita_id and autor_id = auth.uid();
  if not found then
    raise exception 'só quem registrou a visita pode excluí-la';
  end if;
end;
$$;

revoke execute on function registrar_visita(uuid, date, text, text[], date) from public, anon;
revoke execute on function concluir_recomendacao(uuid, boolean) from public, anon;
revoke execute on function excluir_visita(uuid) from public, anon;
grant execute on function registrar_visita(uuid, date, text, text[], date) to authenticated;
grant execute on function concluir_recomendacao(uuid, boolean) to authenticated;
grant execute on function excluir_visita(uuid) to authenticated;
