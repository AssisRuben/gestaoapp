-- Perfil da fazenda (17/10/2026): poucas perguntas que viram número em relatório — área, irrigação,
-- genética, inseminação, mão de obra, ordenha, destino do leite e tanque. Três delas (área usada
-- pro leite, irrigação e raça) entram já no cadastro; o resto o técnico completa no modal da fazenda.
--
-- Cada resposta guarda a DATA: perfis_fazenda é um histórico (uma linha por dia em que o perfil
-- mudou). Assim, se a fazenda começar a irrigar ou trocar a genética depois de entrar no programa,
-- os relatórios mostram o antes e o depois. O perfil de hoje é a view perfil_fazenda_atual.
--
-- Também: patrimônio ganha a data (e o autor) de quando foi salvo, pelo mesmo trigger de autoria
-- dos outros lançamentos (0030) — o usuário não digita nada.

create table if not exists perfis_fazenda (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  area_total_ha numeric check (area_total_ha >= 0),
  area_leite_ha numeric check (area_leite_ha >= 0),
  irrigado boolean,
  area_irrigada_ha numeric check (area_irrigada_ha >= 0),
  raca text check (raca in ('girolando', 'holandes', 'jersey', 'gir', 'mestica', 'outra')),
  inseminacao text check (inseminacao in ('nao', 'menos_1', '1_3', 'mais_3')),
  mao_de_obra text check (mao_de_obra in ('familia', 'familia_contratado', 'contratado')),
  pessoas integer check (pessoas between 1 and 200),
  ordenha text check (ordenha in ('manual', 'mecanica')),
  ordenhas_dia integer check (ordenhas_dia in (1, 2, 3)),
  destino_leite text check (destino_leite in ('laticinio', 'cooperativa', 'queijeira', 'venda_direta', 'faz_queijo')),
  tanque text check (tanque in ('sim', 'coletivo', 'nao')),
  data_referencia date not null default _hoje_fazenda(),
  registrado_em timestamptz not null default now(),
  registrado_por uuid references auth.users(id) on delete set null,
  registrado_por_nome text
);

create index if not exists perfis_fazenda_propriedade on perfis_fazenda (propriedade_id, registrado_em desc);

alter table perfis_fazenda enable row level security;

drop policy if exists "vinculo ou gestor le perfil" on perfis_fazenda;
create policy "vinculo ou gestor le perfil" on perfis_fazenda for select
  using (
    exists (select 1 from usuarios_propriedades up
            where up.propriedade_id = perfis_fazenda.propriedade_id and up.usuario_id = auth.uid())
    or exists (select 1 from gestores g where g.usuario_id = auth.uid())
  );

create or replace view perfil_fazenda_atual with (security_invoker = true) as
select distinct on (propriedade_id) *
from perfis_fazenda
order by propriedade_id, registrado_em desc;

-- número digitado ("20,5", "20.5", "") → numeric; inválido vira erro com o nome do campo
create or replace function _perfil_numero(p_valor text, p_campo text) returns numeric
language plpgsql
immutable
as $$
declare
  v numeric;
begin
  if p_valor is null or trim(p_valor) = '' then return null; end if;
  begin
    v := replace(trim(p_valor), ',', '.')::numeric;
  exception when others then
    raise exception '% inválido: "%"', p_campo, p_valor;
  end;
  if v < 0 then raise exception '% não pode ser negativo', p_campo; end if;
  return v;
end;
$$;

-- Regra única de gravação (site, cadastro). p_dados traz só os campos respondidos; o que não vier
-- continua como estava. Mudou algo no mesmo dia → corrige a linha do dia; em outro dia → linha nova.
create or replace function _salvar_perfil_fazenda(
  p_propriedade_id uuid,
  p_dados jsonb,
  p_usuario uuid
) returns perfis_fazenda
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atual perfis_fazenda;
  v_novo perfis_fazenda;
  v_hoje date := _hoje_fazenda();
  d jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  select * into v_atual from perfis_fazenda
  where propriedade_id = p_propriedade_id
  order by registrado_em desc limit 1;

  v_novo := v_atual;
  v_novo.propriedade_id := p_propriedade_id;

  if d ? 'area_total_ha' then v_novo.area_total_ha := _perfil_numero(d->>'area_total_ha', 'Área total'); end if;
  if d ? 'area_leite_ha' then v_novo.area_leite_ha := _perfil_numero(d->>'area_leite_ha', 'Área usada pro leite'); end if;
  if d ? 'irrigado' then
    v_novo.irrigado := case lower(coalesce(d->>'irrigado', '')) when 'true' then true when 'sim' then true
                                                              when 'false' then false when 'nao' then false end;
  end if;
  if d ? 'area_irrigada_ha' then v_novo.area_irrigada_ha := _perfil_numero(d->>'area_irrigada_ha', 'Área irrigada'); end if;
  if d ? 'raca' then v_novo.raca := nullif(d->>'raca', ''); end if;
  if d ? 'inseminacao' then v_novo.inseminacao := nullif(d->>'inseminacao', ''); end if;
  if d ? 'mao_de_obra' then v_novo.mao_de_obra := nullif(d->>'mao_de_obra', ''); end if;
  if d ? 'pessoas' then v_novo.pessoas := _perfil_numero(d->>'pessoas', 'Número de pessoas')::integer; end if;
  if d ? 'ordenha' then v_novo.ordenha := nullif(d->>'ordenha', ''); end if;
  if d ? 'ordenhas_dia' then v_novo.ordenhas_dia := _perfil_numero(d->>'ordenhas_dia', 'Ordenhas por dia')::integer; end if;
  if d ? 'destino_leite' then v_novo.destino_leite := nullif(d->>'destino_leite', ''); end if;
  if d ? 'tanque' then v_novo.tanque := nullif(d->>'tanque', ''); end if;

  if v_novo.irrigado is distinct from true then
    v_novo.area_irrigada_ha := null;
  end if;
  if v_novo.area_leite_ha > v_novo.area_total_ha then
    raise exception 'A área usada pro leite (% ha) não pode ser maior que a área total (% ha).',
      v_novo.area_leite_ha, v_novo.area_total_ha;
  end if;
  if v_novo.area_irrigada_ha > coalesce(v_novo.area_total_ha, v_novo.area_irrigada_ha) then
    raise exception 'A área irrigada (% ha) não pode ser maior que a área total (% ha).',
      v_novo.area_irrigada_ha, v_novo.area_total_ha;
  end if;

  -- nada mudou: não cria histórico à toa
  if v_atual.id is not null and
     (v_novo.area_total_ha, v_novo.area_leite_ha, v_novo.irrigado, v_novo.area_irrigada_ha, v_novo.raca,
      v_novo.inseminacao, v_novo.mao_de_obra, v_novo.pessoas, v_novo.ordenha, v_novo.ordenhas_dia,
      v_novo.destino_leite, v_novo.tanque)
     is not distinct from
     (v_atual.area_total_ha, v_atual.area_leite_ha, v_atual.irrigado, v_atual.area_irrigada_ha, v_atual.raca,
      v_atual.inseminacao, v_atual.mao_de_obra, v_atual.pessoas, v_atual.ordenha, v_atual.ordenhas_dia,
      v_atual.destino_leite, v_atual.tanque) then
    return v_atual;
  end if;

  v_novo.registrado_em := now();
  v_novo.registrado_por := p_usuario;
  v_novo.registrado_por_nome := (select coalesce(_nome_usuario(u.raw_user_meta_data), u.email::text)
                                 from auth.users u where u.id = p_usuario);

  if v_atual.id is not null and v_atual.data_referencia = v_hoje then
    update perfis_fazenda set
      area_total_ha = v_novo.area_total_ha, area_leite_ha = v_novo.area_leite_ha,
      irrigado = v_novo.irrigado, area_irrigada_ha = v_novo.area_irrigada_ha, raca = v_novo.raca,
      inseminacao = v_novo.inseminacao, mao_de_obra = v_novo.mao_de_obra, pessoas = v_novo.pessoas,
      ordenha = v_novo.ordenha, ordenhas_dia = v_novo.ordenhas_dia, destino_leite = v_novo.destino_leite,
      tanque = v_novo.tanque, registrado_em = v_novo.registrado_em, registrado_por = v_novo.registrado_por,
      registrado_por_nome = v_novo.registrado_por_nome
    where id = v_atual.id
    returning * into v_novo;
  else
    insert into perfis_fazenda (
      propriedade_id, area_total_ha, area_leite_ha, irrigado, area_irrigada_ha, raca, inseminacao,
      mao_de_obra, pessoas, ordenha, ordenhas_dia, destino_leite, tanque, data_referencia,
      registrado_em, registrado_por, registrado_por_nome)
    values (
      p_propriedade_id, v_novo.area_total_ha, v_novo.area_leite_ha, v_novo.irrigado, v_novo.area_irrigada_ha,
      v_novo.raca, v_novo.inseminacao, v_novo.mao_de_obra, v_novo.pessoas, v_novo.ordenha, v_novo.ordenhas_dia,
      v_novo.destino_leite, v_novo.tanque, v_hoje, v_novo.registrado_em, v_novo.registrado_por,
      v_novo.registrado_por_nome)
    returning * into v_novo;
  end if;

  return v_novo;
end;
$$;

revoke execute on function _salvar_perfil_fazenda(uuid, jsonb, uuid) from public, anon, authenticated;

-- porta do site: produtor ou técnico da fazenda
create or replace function salvar_perfil_fazenda(p_propriedade_id uuid, p_dados jsonb) returns perfis_fazenda
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;
  return _salvar_perfil_fazenda(p_propriedade_id, p_dados, auth.uid());
end;
$$;

revoke execute on function salvar_perfil_fazenda(uuid, jsonb) from public, anon;
grant execute on function salvar_perfil_fazenda(uuid, jsonb) to authenticated;

-- ============================================================
-- Cadastro "Sou produtor" (0048) + as perguntas do perfil que vêm no metadata ("perfil")
-- ============================================================

create or replace function public.handle_new_user_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid;
  v_nome_propriedade text := new.raw_user_meta_data->>'nome_propriedade';
  v_nome_produtor text := new.raw_user_meta_data->>'nome_produtor';
  v_municipio text := new.raw_user_meta_data->>'municipio';
  v_estado text := new.raw_user_meta_data->>'estado';
  v_tecnico_responsavel text := new.raw_user_meta_data->>'tecnico_responsavel';
  v_whatsapp text := new.raw_user_meta_data->>'whatsapp';
begin
  if v_nome_propriedade is null or v_nome_propriedade = '' then
    return new;
  end if;

  -- WhatsApp já de uma fazenda: é o produtor dela chegando ao site — não cria fazenda nova
  if v_whatsapp is not null and v_whatsapp <> '' and exists (
    select 1 from usuarios_whatsapp
    where public._telefone_chave(telefone) = public._telefone_chave(v_whatsapp)
  ) then
    return new;
  end if;

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel, latitude, longitude)
  values (v_nome_propriedade, v_nome_produtor, v_municipio, v_estado, v_tecnico_responsavel,
          public._coordenada(new.raw_user_meta_data->>'latitude', 90),
          public._coordenada(new.raw_user_meta_data->>'longitude', 180))
  returning id into v_propriedade_id;

  insert into usuarios_propriedades (usuario_id, propriedade_id, papel)
  values (new.id, v_propriedade_id, 'produtor');

  if v_whatsapp is not null and v_whatsapp <> '' then
    begin
      insert into usuarios_whatsapp (propriedade_id, telefone)
      values (v_propriedade_id, v_whatsapp);
    exception when others then
      raise warning 'cadastro sem WhatsApp (%): %', v_whatsapp, sqlerrm;
    end;
  end if;

  -- perguntas do perfil respondidas no cadastro: resposta ruim não impede a conta de ser criada
  if jsonb_typeof(new.raw_user_meta_data->'perfil') = 'object' then
    begin
      perform public._salvar_perfil_fazenda(v_propriedade_id, new.raw_user_meta_data->'perfil', new.id);
    exception when others then
      raise warning 'cadastro sem perfil da fazenda: %', sqlerrm;
    end;
  end if;

  return new;
end;
$$;

-- ============================================================
-- Patrimônio: data e autor de quando foi salvo (trigger de autoria, 0030)
-- ============================================================

alter table patrimonio add column if not exists criado_por uuid references auth.users(id) on delete set null;
alter table patrimonio add column if not exists criado_via text;
alter table patrimonio add column if not exists atualizado_por uuid references auth.users(id) on delete set null;
alter table patrimonio add column if not exists atualizado_em timestamptz;

drop trigger if exists autoria on patrimonio;
create trigger autoria before insert or update on patrimonio
  for each row execute function _autoria_preencher();
