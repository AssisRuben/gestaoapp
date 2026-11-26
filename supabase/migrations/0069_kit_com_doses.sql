-- Kit cedido já leva as doses dele (26/11/2026). Decisão do usuário: o kit SEMPRE vai junto com as
-- doses que vêm nele. Ceder o kit pela aba Entidades pode criar, na mesma transação, uma entrega por
-- touro da composição do kit (pra fazenda ou técnico, saindo do saldo da entidade, esperando a
-- confirmação como qualquer entrega).
--
-- A entrega guarda de qual kit veio (kit_id): as doses de um kit são entregues uma vez só — o kit
-- devolvido e cedido de novo vai sem doses.

-- ============================================================
-- 1. Composição do kit (doses por touro)
-- ============================================================

create table if not exists kit_composicao (
  touro_id uuid primary key references touros(id),
  doses integer not null check (doses > 0)
);

alter table kit_composicao enable row level security;

drop policy if exists "gestor ve composicao do kit" on kit_composicao;
create policy "gestor ve composicao do kit" on kit_composicao for select
  using (exists (select 1 from gestores g where g.usuario_id = auth.uid()));

-- kit da doação CODEVASF: 220 doses (touros cadastrados na produção em 26/11/2026). Num banco sem
-- esses touros não grava nada.
insert into kit_composicao (touro_id, doses)
select t.id, v.doses
from (values
  ('Holandês', 70),
  ('Holandês sexado', 40),
  ('Girolando ¾', 35),
  ('Girolando 5/8', 35),
  ('Girolando ¾ sexado', 20),
  ('Girolando 5/8 sexado', 20)
) as v(nome, doses)
join touros t on t.nome = v.nome
on conflict (touro_id) do nothing;

-- ============================================================
-- 2. Entrega ligada ao kit
-- ============================================================

alter table entregas_doses add column if not exists kit_id uuid references kits_inseminacao(id) on delete set null;
alter table entregas_doses_tecnico add column if not exists kit_id uuid references kits_inseminacao(id) on delete set null;

create index if not exists idx_entregas_doses_kit on entregas_doses (kit_id) where kit_id is not null;
create index if not exists idx_entregas_doses_tecnico_kit on entregas_doses_tecnico (kit_id) where kit_id is not null;

-- ============================================================
-- 3. Ceder o kit (com ou sem as doses)
-- ============================================================

-- Devolve quantas doses foram entregues (0 quando sem doses). Sem saldo na entidade, o trigger de 0068
-- recusa a entrega e nada é gravado (nem a cessão).
create or replace function gestor_ceder_kit(
  p_kit_id uuid,
  p_propriedade_id uuid,
  p_tecnico_id uuid,
  p_cedido_em date,
  p_observacao text default null,
  p_entregar_doses boolean default true
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit kits_inseminacao;
  v_item kit_composicao;
  v_total integer := 0;
  v_obs text;
begin
  if not _eh_gestor() then
    raise exception 'Só o gestor do programa pode ceder kits.';
  end if;
  if (p_propriedade_id is null) = (p_tecnico_id is null) then
    raise exception 'Escolha a fazenda ou o técnico que fica com o kit.';
  end if;
  if p_cedido_em is null then
    raise exception 'Informe a data da cessão.';
  end if;
  if p_cedido_em > _hoje_fazenda() then
    raise exception 'A data da cessão não pode ser no futuro.';
  end if;

  select * into v_kit from kits_inseminacao where id = p_kit_id for update;
  if not found then
    raise exception 'Kit não encontrado.';
  end if;

  update kits_inseminacao
  set propriedade_id = p_propriedade_id,
      tecnico_id = p_tecnico_id,
      cedido_em = p_cedido_em,
      observacao = nullif(trim(p_observacao), '')
  where id = p_kit_id;

  if not p_entregar_doses then
    return 0;
  end if;

  if exists (select 1 from entregas_doses where kit_id = p_kit_id)
     or exists (select 1 from entregas_doses_tecnico where kit_id = p_kit_id) then
    raise exception 'As doses do kit % já foram entregues. Desmarque "Entregar também as doses do kit".', v_kit.patrimonio;
  end if;
  if not exists (select 1 from kit_composicao) then
    raise exception 'A composição do kit (doses por touro) não está cadastrada.';
  end if;

  v_obs := format('Kit %s', v_kit.patrimonio);
  for v_item in select * from kit_composicao loop
    if p_tecnico_id is not null then
      insert into entregas_doses_tecnico (tecnico_id, touro_id, quantidade, entidade_id, data_entrega, observacao, registrado_por, kit_id)
      values (p_tecnico_id, v_item.touro_id, v_item.doses, v_kit.entidade_id, p_cedido_em, v_obs, auth.uid(), p_kit_id);
    else
      insert into entregas_doses (propriedade_id, touro_id, quantidade, entidade_id, data_entrega, observacao, registrado_por, kit_id)
      values (p_propriedade_id, v_item.touro_id, v_item.doses, v_kit.entidade_id, p_cedido_em, v_obs, auth.uid(), p_kit_id);
    end if;
    v_total := v_total + v_item.doses;
  end loop;

  return v_total;
end;
$$;

revoke execute on function gestor_ceder_kit(uuid, uuid, uuid, date, text, boolean) from public, anon;
grant execute on function gestor_ceder_kit(uuid, uuid, uuid, date, text, boolean) to authenticated;
