-- Entidades (12/10/2026):
-- 1. CNPJ no cadastro da entidade (com dígitos verificadores conferidos) e cadastro/edição pela aba
--    Entidades do gestor — antes a entidade só nascia dentro da entrega de doses.
-- 2. Índices da entidade em MÉDIA POR FAZENDA (decisão do usuário: a ideia é comparar a eficiência
--    entre entidades; soma faria a entidade maior parecer melhor). Totais só pro que é contagem:
--    doses, kits, gestações e nascidos. Entidade sem fazenda ainda aparece (0 fazendas).

alter table entidades add column if not exists cnpj text;
create unique index if not exists idx_entidades_cnpj on entidades (cnpj) where cnpj is not null;

-- Só dígitos, 14, com os dois dígitos verificadores certos. Vazio = null.
create or replace function _cnpj_valido(p_cnpj text) returns text
language plpgsql
immutable
as $$
declare
  d text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  pesos1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  pesos2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  soma int;
  dv1 int;
  dv2 int;
begin
  if d = '' then return null; end if;
  if length(d) <> 14 or d ~ '^(\d)\1{13}$' then
    raise exception 'CNPJ inválido: confira os 14 números.';
  end if;
  soma := 0;
  for i in 1..12 loop soma := soma + substr(d, i, 1)::int * pesos1[i]; end loop;
  dv1 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  soma := 0;
  for i in 1..13 loop soma := soma + substr(d, i, 1)::int * pesos2[i]; end loop;
  dv2 := case when soma % 11 < 2 then 0 else 11 - soma % 11 end;
  if substr(d, 13, 1)::int <> dv1 or substr(d, 14, 1)::int <> dv2 then
    raise exception 'CNPJ inválido: os dígitos verificadores não conferem.';
  end if;
  return d;
end;
$$;

-- Entrega de doses (0048) + CNPJ: acha pelo CNPJ (se veio) ou pelo nome; cria se não achar.
drop function if exists gestor_salvar_entidade(text, text, text);
create or replace function gestor_salvar_entidade(
  p_nome text,
  p_responsavel text default null,
  p_telefone text default null,
  p_cnpj text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_cnpj text := _cnpj_valido(p_cnpj);
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor do programa pode cadastrar entidades.';
  end if;
  if nullif(trim(p_nome), '') is null then
    raise exception 'Informe a entidade beneficiada.';
  end if;

  if v_cnpj is not null then
    select id into v_id from entidades where cnpj = v_cnpj;
  end if;
  if v_id is null then
    select id into v_id from entidades where lower(trim(nome)) = lower(trim(p_nome));
  end if;

  if v_id is null then
    insert into entidades (nome, cnpj, responsavel, telefone)
    values (trim(p_nome), v_cnpj, nullif(trim(p_responsavel), ''), nullif(trim(p_telefone), ''))
    returning id into v_id;
  else
    update entidades set
      cnpj = coalesce(v_cnpj, cnpj),
      responsavel = coalesce(nullif(trim(p_responsavel), ''), responsavel),
      telefone = coalesce(nullif(trim(p_telefone), ''), telefone)
    where id = v_id;
  end if;
  return v_id;
end;
$$;

-- Aba Entidades: cadastrar (p_id nulo) ou editar tudo da entidade.
create or replace function gestor_editar_entidade(
  p_id uuid,
  p_nome text,
  p_cnpj text,
  p_responsavel text,
  p_telefone text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := p_id;
  v_cnpj text := _cnpj_valido(p_cnpj);
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor do programa pode cadastrar entidades.';
  end if;
  if nullif(trim(p_nome), '') is null then
    raise exception 'Informe o nome da entidade.';
  end if;
  if exists (select 1 from entidades where lower(trim(nome)) = lower(trim(p_nome)) and id is distinct from p_id) then
    raise exception 'Já existe uma entidade com o nome "%".', trim(p_nome);
  end if;
  if v_cnpj is not null and exists (select 1 from entidades where cnpj = v_cnpj and id is distinct from p_id) then
    raise exception 'Esse CNPJ já está cadastrado em outra entidade.';
  end if;

  if v_id is null then
    insert into entidades (nome, cnpj, responsavel, telefone)
    values (trim(p_nome), v_cnpj, nullif(trim(p_responsavel), ''), nullif(trim(p_telefone), ''))
    returning id into v_id;
  else
    update entidades set nome = trim(p_nome), cnpj = v_cnpj,
      responsavel = nullif(trim(p_responsavel), ''), telefone = nullif(trim(p_telefone), '')
    where id = v_id;
    if not found then raise exception 'Entidade não encontrada.'; end if;
  end if;
  return v_id;
end;
$$;

revoke execute on function gestor_salvar_entidade(text, text, text, text) from public, anon;
revoke execute on function gestor_editar_entidade(uuid, text, text, text, text) from public, anon;
grant execute on function gestor_salvar_entidade(text, text, text, text) to authenticated;
grant execute on function gestor_editar_entidade(uuid, text, text, text, text) to authenticated;

-- ============================================================
-- Índices por entidade: médias por fazenda
-- ============================================================

drop function if exists indicadores_entidades();
create or replace function indicadores_entidades()
returns table (
  entidade_id uuid,
  entidade_nome text,
  cnpj text,
  responsavel text,
  telefone text,
  fazendas integer,
  vacas_lactacao_media numeric,
  producao_dia_media numeric,
  litros_vaca_dia_media numeric,
  receita_mensal_media numeric,
  despesa_mensal_media numeric,
  custo_litro_medio numeric,
  receita_litro_media numeric,
  sobra_litro_media numeric,
  iep_medio numeric,
  taxa_concepcao_media numeric,
  doses_por_prenhez_media numeric,
  doses_recebidas integer,
  doses_pendentes integer,
  kits integer,
  gestacoes_em_curso integer,
  nascimentos integer
)
language sql
stable
security definer
set search_path = public
as $$
  with f as (
    select *,
           case when producao_dia > 0 then receita_mensal / (producao_dia * 30) end as receita_litro,
           case when producao_dia > 0 and receita_mensal is not null and custo_litro is not null
                then receita_mensal / (producao_dia * 30) - custo_litro end as sobra_litro,
           iep_soma / nullif(iep_qtd, 0) as iep_fazenda,
           case when prenhezes + negativos > 0 then prenhezes * 100.0 / (prenhezes + negativos) end as concepcao,
           case when prenhezes > 0 then doses_usadas::numeric / prenhezes end as doses_prenhez
    from indicadores_entidades_fazendas()
  )
  select en.id, en.nome, en.cnpj, en.responsavel, en.telefone,
         count(f.propriedade_id)::integer,
         round(avg(f.vacas_lactacao), 1),
         round(avg(f.producao_dia), 1),
         round(avg(f.litros_vaca_dia), 2),
         round(avg(f.receita_mensal), 2),
         round(avg(f.despesa_mensal), 2),
         round(avg(f.custo_litro), 2),
         round(avg(f.receita_litro), 2),
         round(avg(f.sobra_litro), 2),
         round(avg(f.iep_fazenda), 0),
         round(avg(f.concepcao), 1),
         round(avg(f.doses_prenhez), 2),
         coalesce(sum(f.doses_recebidas), 0)::integer,
         coalesce(sum(f.doses_pendentes), 0)::integer,
         coalesce(sum(f.kits), 0)::integer,
         coalesce(sum(f.gestacoes_em_curso), 0)::integer,
         coalesce(sum(f.nascimentos), 0)::integer
  from entidades en
  left join f on f.entidade_id = en.id
  group by en.id, en.nome, en.cnpj, en.responsavel, en.telefone
  order by en.nome;
$$;

revoke execute on function indicadores_entidades() from public, anon, authenticated;
