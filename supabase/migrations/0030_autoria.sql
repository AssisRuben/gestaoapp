-- Quem lançou o quê (fase 5 do plano de 2026-10-11). Com produtor e técnicos lançando na mesma
-- fazenda (0023) e o bot escrevendo pelo banco (0025), cada registro passa a guardar:
--   criado_por / criado_via ('site' | 'whatsapp') e atualizado_por / atualizado_em.
-- Preenchido por trigger em TODA escrita — site (RPCs security definer ainda enxergam auth.uid())
-- e bot (service role, sem usuário → 'whatsapp'). Nenhuma função existente precisou mudar.
--
-- Também: ao arquivar a lactação (registrar_parto), controle_leite_historico passa a receber o
-- período da ordenha e a autoria, copiados do lançamento original por um trigger — sem reescrever
-- _registrar_parto, que lista as colunas do INSERT explicitamente.

create or replace function _autoria_preencher() returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.criado_via := coalesce(new.criado_via, case when auth.uid() is null then 'whatsapp' else 'site' end);
  else
    new.criado_por := old.criado_por;
    new.criado_via := old.criado_via;
    new.atualizado_por := auth.uid();
    new.atualizado_em := now();
  end if;
  return new;
end;
$$;

do $$
declare
  v_tabela text;
begin
  foreach v_tabela in array array['controle_leite', 'coberturas', 'partos', 'financeiro', 'vacas', 'bezerros'] loop
    execute format('alter table %I add column if not exists criado_por uuid references auth.users(id) on delete set null', v_tabela);
    execute format('alter table %I add column if not exists criado_via text', v_tabela);
    execute format('alter table %I add column if not exists atualizado_por uuid references auth.users(id) on delete set null', v_tabela);
    execute format('alter table %I add column if not exists atualizado_em timestamptz', v_tabela);
    execute format('drop trigger if exists autoria on %I', v_tabela);
    execute format('create trigger autoria before insert or update on %I for each row execute function _autoria_preencher()', v_tabela);
  end loop;
end $$;

-- histórico do leite: período + autoria vêm do lançamento que está sendo arquivado
alter table controle_leite_historico add column if not exists criado_por uuid;
alter table controle_leite_historico add column if not exists criado_via text;

create or replace function _leite_historico_completar() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origem controle_leite;
begin
  select * into v_origem from controle_leite where id = new.id;
  if v_origem.id is not null then
    new.periodo := coalesce(new.periodo, v_origem.periodo);
    new.criado_por := coalesce(new.criado_por, v_origem.criado_por);
    new.criado_via := coalesce(new.criado_via, v_origem.criado_via);
  end if;
  return new;
end;
$$;

drop trigger if exists completar on controle_leite_historico;
create trigger completar before insert on controle_leite_historico
  for each row execute function _leite_historico_completar();
