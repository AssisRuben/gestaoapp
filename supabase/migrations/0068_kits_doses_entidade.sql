-- Kits de inseminação e doses pela ENTIDADE (26/11/2026). Decisões do usuário:
--   - o kit de inseminação é doado à entidade (processo de doação da CODEVASF, um número de patrimônio
--     por kit) e continua sendo dela: vai pra uma fazenda ou um técnico como CESSÃO DE USO, e o gestor
--     precisa saber com quem cada kit está;
--   - as doses passam pela entidade: o gestor registra as doses que a entidade recebeu e a entrega pra
--     fazenda/técnico (que já tem a entidade, 0048/0055) sai do saldo dela;
--   - a "quantidade de kits" da entrega de doses deixa de ser pedida (a coluna fica, com o que já foi
--     gravado).
-- A entidade não tem conta no site: quem registra tudo isso é o gestor.

-- ============================================================
-- 1. Kits (um por patrimônio)
-- ============================================================

create table if not exists kits_inseminacao (
  id uuid primary key default gen_random_uuid(),
  entidade_id uuid not null references entidades(id),
  patrimonio text not null,
  processo text,
  -- cessão de uso: com uma fazenda OU um técnico; os dois vazios = o kit está na entidade
  propriedade_id uuid references propriedades(id) on delete set null,
  tecnico_id uuid references auth.users(id) on delete set null,
  cedido_em date,
  observacao text,
  created_at timestamptz not null default now(),
  constraint kits_um_destino check (propriedade_id is null or tecnico_id is null)
);

create unique index if not exists idx_kits_patrimonio on kits_inseminacao (patrimonio);
create index if not exists idx_kits_entidade on kits_inseminacao (entidade_id);

alter table kits_inseminacao enable row level security;

drop policy if exists "gestor ve kits" on kits_inseminacao;
create policy "gestor ve kits" on kits_inseminacao for select
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()));
drop policy if exists "gestor insere kits" on kits_inseminacao;
create policy "gestor insere kits" on kits_inseminacao for insert
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));
drop policy if exists "gestor atualiza kits" on kits_inseminacao;
create policy "gestor atualiza kits" on kits_inseminacao for update
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()))
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));
drop policy if exists "gestor deleta kits" on kits_inseminacao;
create policy "gestor deleta kits" on kits_inseminacao for delete
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

-- ============================================================
-- 2. Doses que a entidade recebeu e o saldo dela
-- ============================================================

create table if not exists entregas_doses_entidade (
  id uuid primary key default gen_random_uuid(),
  entidade_id uuid not null references entidades(id),
  touro_id uuid not null references touros(id),
  quantidade integer not null check (quantidade > 0),
  data_entrega date not null,
  observacao text,
  registrado_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists idx_entregas_doses_entidade on entregas_doses_entidade (entidade_id, touro_id);

alter table entregas_doses_entidade enable row level security;

drop policy if exists "gestor ve doses da entidade" on entregas_doses_entidade;
create policy "gestor ve doses da entidade" on entregas_doses_entidade for select
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()));
drop policy if exists "gestor insere doses da entidade" on entregas_doses_entidade;
create policy "gestor insere doses da entidade" on entregas_doses_entidade for insert
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));
drop policy if exists "gestor atualiza doses da entidade" on entregas_doses_entidade;
create policy "gestor atualiza doses da entidade" on entregas_doses_entidade for update
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()))
  with check (exists (select 1 from gestores g where g.usuario_id = auth.uid()));
drop policy if exists "gestor deleta doses da entidade" on entregas_doses_entidade;
create policy "gestor deleta doses da entidade" on entregas_doses_entidade for delete
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

-- Saldo = recebidas − repassadas. Repassada = entrega pra fazenda ou técnico com esta entidade, mesmo
-- ainda sem confirmação (a dose já saiu da entidade). A transferência do técnico pra fazenda
-- (origem_tecnico_id) não conta: essas doses já saíram da entidade quando foram pro técnico.
create or replace view saldo_doses_entidade with (security_invoker = true) as
with mov as (
  select entidade_id, touro_id, quantidade as recebidas, 0 as repassadas
  from entregas_doses_entidade
  union all
  select entidade_id, touro_id, 0, quantidade
  from entregas_doses
  where entidade_id is not null and origem_tecnico_id is null
  union all
  select entidade_id, touro_id, 0, quantidade
  from entregas_doses_tecnico
  where entidade_id is not null
)
select entidade_id, touro_id,
       sum(recebidas)::integer as recebidas,
       sum(repassadas)::integer as repassadas,
       (sum(recebidas) - sum(repassadas))::integer as saldo
from mov
group by entidade_id, touro_id;

create or replace function _saldo_dose_entidade(p_entidade_id uuid, p_touro_id uuid) returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select saldo from saldo_doses_entidade where entidade_id = p_entidade_id and touro_id = p_touro_id), 0);
$$;

revoke execute on function _saldo_dose_entidade(uuid, uuid) from public, anon, authenticated;

-- Entrega pra fazenda/técnico: a entidade precisa ter as doses. Confere depois de gravar (o saldo já
-- inclui a linha nova). Mudança que não mexe em entidade, touro nem quantidade (confirmação de
-- recebimento, observação) não é conferida.
create or replace function _conferir_saldo_entidade() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_saldo integer;
begin
  if new.entidade_id is null then
    return new;
  end if;
  -- origem_tecnico_id só existe em entregas_doses (o plpgsql não para no "and": lê por jsonb)
  if (to_jsonb(new) ->> 'origem_tecnico_id') is not null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.entidade_id is not distinct from old.entidade_id
     and new.touro_id is not distinct from old.touro_id
     and new.quantidade <= old.quantidade then
    return new;
  end if;

  v_saldo := _saldo_dose_entidade(new.entidade_id, new.touro_id);
  if v_saldo < 0 then
    raise exception 'A entidade % não tem doses suficientes do touro %: tem % e a entrega pede %. Registre antes as doses que a entidade recebeu (aba Entidades).',
      (select nome from entidades where id = new.entidade_id),
      (select nome from touros where id = new.touro_id),
      v_saldo + new.quantidade,
      new.quantidade;
  end if;
  return new;
end;
$$;

drop trigger if exists entregas_doses_saldo_entidade on entregas_doses;
create trigger entregas_doses_saldo_entidade
  after insert or update on entregas_doses
  for each row execute function _conferir_saldo_entidade();

drop trigger if exists entregas_doses_tecnico_saldo_entidade on entregas_doses_tecnico;
create trigger entregas_doses_tecnico_saldo_entidade
  after insert or update on entregas_doses_tecnico
  for each row execute function _conferir_saldo_entidade();

-- Doses que a entidade recebeu: diminuir ou apagar não pode deixar o saldo negativo (as doses já
-- foram repassadas pra fazendas/técnicos).
create or replace function _conferir_baixa_doses_entidade() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if _saldo_dose_entidade(old.entidade_id, old.touro_id) < 0 then
    raise exception 'Essas doses já foram repassadas pra fazendas ou técnicos. Corrija ou exclua antes as entregas (aba Programa).';
  end if;
  return null;
end;
$$;

drop trigger if exists entregas_doses_entidade_baixa on entregas_doses_entidade;
create trigger entregas_doses_entidade_baixa
  after update or delete on entregas_doses_entidade
  for each row execute function _conferir_baixa_doses_entidade();

-- ============================================================
-- 3. Kits da doação CODEVASF (relatório "Processos de Doação" de 25/11/2026, 21 processos, 87 kits)
-- ============================================================
-- Liga pelo CNPJ das entidades já cadastradas na produção; num banco sem essas entidades não grava
-- nada. Rodar de novo não duplica (patrimônio é único).

insert into kits_inseminacao (entidade_id, processo, patrimonio)
select e.id, v.processo, p.patrimonio
from (values
  ('07946796000119', '59511.000479/2026-12', array['426.632-1', '426.633-8', '426.637-6']),
  ('07570518000100', '59511.000463/2026-00', array['426.618-7', '426.619-4', '426.620-4', '426.621-1']),
  ('07520141000184', '59511.000454/2026-19', array['426.554-0', '426.555-7']),
  ('12474441000104', '59511.000489/2026-40', array['426.634-5', '426.635-2', '426.631-4']),
  ('07539273000158', '59511.000468/2026-24', array['426.556-4', '426.557-1']),
  ('07520372000198', '59511.000467/2026-80', array['426.552-6', '426.553-3']),
  ('07849532000147', '59511.000466/2026-35', array['426.579-1', '426.580-1', '426.581-8', '426.582-5', '426.583-2',
                                                   '426.584-9', '426.585-6', '426.586-3', '426.587-0', '426.588-7',
                                                   '426.589-4', '426.590-4', '426.597-3', '426.598-0', '426.599-7']),
  ('07551179000114', '59511.000465/2026-91', array['426.612-5', '426.613-2', '426.614-9', '426.615-6', '426.616-3', '426.617-0']),
  ('07738057000131', '59511.000464/2026-46', array['426.558-8', '426.559-5']),
  ('07726540000104', '59511.000462/2026-57', array['426.591-1', '426.592-8', '426.593-5']),
  ('08727162000138', '59511.000461/2026-11', array['426.596-6', '426.629-7', '426.630-7']),
  ('35223544000105', '59511.000459/2026-33', array['426.573-9', '426.574-6', '426.575-3']),
  ('07736390000101', '59511.000458/2026-99', array['426.622-8', '426.623-5', '426.624-2']),
  ('12474102000128', '59511.000457/2026-44', array['426.570-8', '426.571-5', '426.572-2']),
  ('07609621000116', '59511.000456/2026-08', array['426.549-2', '426.550-2', '426.551-9']),
  ('05844111000106', '59511.000455/2026-55', array['426.576-0', '426.577-7', '426.578-4', '426.600-8', '426.601-5',
                                                   '426.602-2', '426.603-9', '426.604-6', '426.605-3', '426.606-0',
                                                   '426.607-7', '426.608-4', '426.609-1', '426.610-1', '426.611-8']),
  ('07946796000119', '59511.000453/2026-66', array['426.560-5', '426.561-2', '426.562-9', '426.563-6', '426.564-3']),
  ('54435001000198', '59511.000452/2026-11', array['426.565-0', '426.566-7', '426.567-4', '426.568-1', '426.569-8']),
  ('07982036000167', '59511.000451/2026-77', array['426.595-9']),
  ('01341706000180', '59511.000450/2026-22', array['426.627-3', '426.628-0']),
  ('03462346000108', '59511.000449/2026-06', array['426.625-9', '426.626-6'])
) as v(cnpj, processo, patrimonios)
join entidades e on e.cnpj = v.cnpj
cross join lateral unnest(v.patrimonios) as p(patrimonio)
on conflict (patrimonio) do nothing;
