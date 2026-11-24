-- Autoria de conta excluída (24/11/2026).
--
-- Bug: as colunas criado_por/atualizado_por têm "on delete set null" (0030), mas o trigger
-- _autoria_preencher, no UPDATE, devolvia new.criado_por := old.criado_por — e desfazia o set null
-- que o próprio banco faz quando uma conta é excluída. Os registros ficavam apontando pra uma conta
-- que não existe mais. Uma alteração depois disso, numa transação que já tinha mexido na mesma linha
-- (ex.: apagar a cobertura atualiza o status da vaca e outro comando altera a vaca de novo), falhava
-- com "violates foreign key constraint vacas_criado_por_fkey" — foi o que travou a limpeza das
-- fazendas de teste.
--
-- 1. O trigger passa a aceitar o set null quando a conta não existe mais, sem marcar o registro como
--    "alterado" (atualizado_por/atualizado_em ficam como estavam).
-- 2. Limpa os registros que já apontam pra conta excluída, também sem marcar como alterados.

create or replace function _autoria_preencher() returns trigger
language plpgsql
security definer   -- confere auth.users, que o papel do site não lê
set search_path = public
as $$
declare
  v_criador_sumiu boolean;
  v_alterador_sumiu boolean;
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.criado_via := coalesce(new.criado_via, case when auth.uid() is null then 'whatsapp' else 'site' end);
    return new;
  end if;

  -- conta excluída: o banco limpa a coluna (on delete set null) — aceitar, sem mexer no resto
  v_criador_sumiu := old.criado_por is not null and new.criado_por is null
    and not exists (select 1 from auth.users u where u.id = old.criado_por);
  v_alterador_sumiu := old.atualizado_por is not null and new.atualizado_por is null
    and not exists (select 1 from auth.users u where u.id = old.atualizado_por);
  if v_criador_sumiu or v_alterador_sumiu then
    new.criado_via := old.criado_via;
    new.atualizado_em := old.atualizado_em;
    if not v_criador_sumiu then new.criado_por := old.criado_por; end if;
    if not v_alterador_sumiu then new.atualizado_por := old.atualizado_por; end if;
    return new;
  end if;

  new.criado_por := old.criado_por;
  new.criado_via := old.criado_via;
  new.atualizado_por := auth.uid();
  new.atualizado_em := now();
  return new;
end;
$$;

revoke execute on function _autoria_preencher() from public, anon, authenticated;

-- 2. registros que já apontam pra conta excluída (triggers da tabela desligados no UPDATE, pra não
--    marcar como alterado nem disparar recálculos; as chaves estrangeiras continuam valendo)
do $$
declare
  v_tabela text;
  v_tem_atualizado boolean;
begin
  for v_tabela in
    select c.table_name from information_schema.columns c
    join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'criado_por' and t.table_type = 'BASE TABLE'
  loop
    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = v_tabela and column_name = 'atualizado_por'
    ) into v_tem_atualizado;

    execute format('alter table %I disable trigger user', v_tabela);
    if v_tem_atualizado then
      execute format(
        'update %I t set
           criado_por = case when t.criado_por is not null and not exists (select 1 from auth.users u where u.id = t.criado_por) then null else t.criado_por end,
           atualizado_por = case when t.atualizado_por is not null and not exists (select 1 from auth.users u where u.id = t.atualizado_por) then null else t.atualizado_por end
         where (t.criado_por is not null and not exists (select 1 from auth.users u where u.id = t.criado_por))
            or (t.atualizado_por is not null and not exists (select 1 from auth.users u where u.id = t.atualizado_por))',
        v_tabela);
    else
      execute format(
        'update %I t set criado_por = null
         where t.criado_por is not null and not exists (select 1 from auth.users u where u.id = t.criado_por)',
        v_tabela);
    end if;
    execute format('alter table %I enable trigger user', v_tabela);
  end loop;
end $$;
