-- Kit com quem recebe (27/11/2026). Decisões do usuário:
--   - quem recebe o kit (fazenda ou técnico) vê o kit, sabe que o kit e o botijão de nitrogênio ficam
--     sob a responsabilidade dele (cessão de uso da entidade) e confirma o recebimento UMA vez — a
--     confirmação vale pra todas as doses que vieram com o kit (0069), sem confirmar touro por touro;
--   - quem recebe registra o ABASTECIMENTO DO KIT (nível, valor, foto). Com a fazenda, o valor vira
--     despesa dela, como o botijão da fazenda (0058); com o técnico, não há fazenda pra lançar despesa;
--   - kit cedido sem abastecimento há mais de 60 dias aparece nos Alertas do gestor. Conta a partir da
--     cessão: quem recebeu e nunca abasteceu também alerta (diferente do botijão da fazenda, 0064).
--
-- Abastecimento da fazenda que tem UM kit (site antigo ou WhatsApp) vai pro kit sozinho (trigger).

-- ============================================================
-- 1. Recebimento do kit
-- ============================================================

alter table kits_inseminacao add column if not exists recebido_em timestamptz;
alter table kits_inseminacao add column if not exists recebido_por uuid references auth.users(id) on delete set null;
-- abastecimento do kit (seção 2); criada aqui porque as funções abaixo já leem
alter table botijao_abastecimentos add column if not exists kit_id uuid references kits_inseminacao(id) on delete set null;

-- Cessão nova (outro destino ou outra data) ou devolução: o recebimento anterior não vale mais
create or replace function _kit_nova_cessao() returns trigger
language plpgsql
as $$
begin
  if new.propriedade_id is distinct from old.propriedade_id
     or new.tecnico_id is distinct from old.tecnico_id
     or new.cedido_em is distinct from old.cedido_em then
    new.recebido_em := null;
    new.recebido_por := null;
  end if;
  return new;
end;
$$;

drop trigger if exists kits_nova_cessao on kits_inseminacao;
create trigger kits_nova_cessao
  before update on kits_inseminacao
  for each row execute function _kit_nova_cessao();

-- Quem pode mexer no kit do lado de quem recebeu: o técnico dele ou quem tem vínculo com a fazenda
create or replace function _kit_comigo(p_kit kits_inseminacao) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- coalesce: kit sem técnico daria null, e "if not null" deixaria passar
  select coalesce(auth.uid() is not null and (
    p_kit.tecnico_id is not distinct from auth.uid()
    or (p_kit.propriedade_id is not null and exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = p_kit.propriedade_id and up.usuario_id = auth.uid()
    ))
  ), false);
$$;

revoke execute on function _kit_comigo(kits_inseminacao) from public, anon, authenticated;

-- Kits da fazenda aberta + kits do técnico logado, com o que a tela precisa
create or replace function kits_comigo(p_propriedade_id uuid)
returns table (
  id uuid,
  patrimonio text,
  processo text,
  entidade_nome text,
  entidade_responsavel text,
  entidade_telefone text,
  com_tecnico boolean,
  cedido_em date,
  recebido_em timestamptz,
  recebido_por_nome text,
  doses jsonb,
  ultimo_abastecimento date,
  dias_sem_abastecer integer
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.patrimonio, k.processo, e.nome, e.responsavel, e.telefone,
         k.tecnico_id is not null,
         k.cedido_em, k.recebido_em,
         (select _nome_usuario(u.raw_user_meta_data) from auth.users u where u.id = k.recebido_por),
         coalesce((
           select jsonb_agg(jsonb_build_object('touro', t.nome, 'quantidade', d.quantidade, 'recebido', d.recebido_em is not null)
                            order by d.quantidade desc, t.nome)
           from (
             select touro_id, quantidade, recebido_em from entregas_doses where kit_id = k.id
             union all
             select touro_id, quantidade, recebido_em from entregas_doses_tecnico where kit_id = k.id
           ) d join touros t on t.id = d.touro_id
         ), '[]'::jsonb),
         a.ultimo,
         _hoje_fazenda() - coalesce(a.ultimo, k.cedido_em)
  from kits_inseminacao k
  join entidades e on e.id = k.entidade_id
  left join lateral (
    select max(b.data) as ultimo from botijao_abastecimentos b
    where b.kit_id = k.id and b.data >= k.cedido_em
  ) a on true
  where (k.tecnico_id = auth.uid())
     or (k.propriedade_id = p_propriedade_id and exists (
          select 1 from usuarios_propriedades up
          where up.propriedade_id = p_propriedade_id and up.usuario_id = auth.uid()
        ))
  order by k.patrimonio;
$$;

revoke execute on function kits_comigo(uuid) from public, anon;
grant execute on function kits_comigo(uuid) to authenticated;

-- Confirma o kit e, junto, as doses que vieram com ele (as mesmas regras de cada confirmação)
create or replace function confirmar_recebimento_kit(p_kit_id uuid) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit kits_inseminacao;
  v_id uuid;
  v_doses integer := 0;
begin
  select * into v_kit from kits_inseminacao where id = p_kit_id for update;
  if v_kit.id is null then
    raise exception 'kit não encontrado';
  end if;
  if not _kit_comigo(v_kit) then
    raise exception 'esse kit não está com você';
  end if;
  if v_kit.recebido_em is not null then
    raise exception 'o recebimento desse kit já foi confirmado';
  end if;

  update kits_inseminacao set recebido_em = now(), recebido_por = auth.uid() where id = p_kit_id;

  if v_kit.tecnico_id is not null then
    for v_id in select id from entregas_doses_tecnico where kit_id = p_kit_id and recebido_em is null loop
      perform confirmar_recebimento_doses_tecnico(v_id);
      v_doses := v_doses + (select quantidade from entregas_doses_tecnico where id = v_id);
    end loop;
  else
    for v_id in select id from entregas_doses where kit_id = p_kit_id and recebido_em is null loop
      perform confirmar_recebimento_doses(v_id);
      v_doses := v_doses + (select quantidade from entregas_doses where id = v_id);
    end loop;
  end if;

  return v_doses;
end;
$$;

revoke execute on function confirmar_recebimento_kit(uuid) from public, anon;
grant execute on function confirmar_recebimento_kit(uuid) to authenticated;

-- ============================================================
-- 2. Abastecimento do kit
-- ============================================================

-- kit com o técnico: abastecimento sem fazenda
alter table botijao_abastecimentos alter column propriedade_id drop not null;
alter table botijao_abastecimentos drop constraint if exists botijao_fazenda_ou_kit;
alter table botijao_abastecimentos add constraint botijao_fazenda_ou_kit
  check (propriedade_id is not null or kit_id is not null);

create index if not exists idx_botijao_kit_data on botijao_abastecimentos (kit_id, data desc) where kit_id is not null;

-- o técnico com o kit também vê os abastecimentos dele
drop policy if exists "fazenda e gestor veem abastecimentos do botijao" on botijao_abastecimentos;
create policy "fazenda e gestor veem abastecimentos do botijao"
  on botijao_abastecimentos for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = botijao_abastecimentos.propriedade_id and up.usuario_id = auth.uid()
    )
    or exists (select 1 from kits_inseminacao k where k.id = botijao_abastecimentos.kit_id and k.tecnico_id = auth.uid())
    or exists (select 1 from gestores g where g.usuario_id = auth.uid())
  );

-- Abastecimento da fazenda sem kit escolhido (site antigo, WhatsApp): se a fazenda tem exatamente
-- um kit, é dele
create or replace function _botijao_kit_da_fazenda() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kits uuid[];
begin
  if new.kit_id is null and new.propriedade_id is not null then
    select array_agg(id) into v_kits from kits_inseminacao where propriedade_id = new.propriedade_id;
    if array_length(v_kits, 1) = 1 then
      new.kit_id := v_kits[1];
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists botijao_kit_da_fazenda on botijao_abastecimentos;
create trigger botijao_kit_da_fazenda
  before insert on botijao_abastecimentos
  for each row execute function _botijao_kit_da_fazenda();

-- Foto: "kit/<kit_id>/<arquivo>" (o site envia com a service role depois de conferir a sessão)
create or replace function registrar_abastecimento_kit(
  p_kit_id uuid,
  p_data date,
  p_nivel_cm numeric,
  p_valor numeric,
  p_foto_path text
) returns botijao_abastecimentos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit kits_inseminacao;
  v_fin uuid;
  v_abast botijao_abastecimentos;
begin
  select * into v_kit from kits_inseminacao where id = p_kit_id;
  if v_kit.id is null then
    raise exception 'kit não encontrado';
  end if;
  if not _kit_comigo(v_kit) then
    raise exception 'esse kit não está com você';
  end if;

  if p_data is null then
    raise exception 'informe a data do abastecimento';
  end if;
  if p_data > _hoje_fazenda() then
    raise exception 'a data do abastecimento não pode ser no futuro';
  end if;
  if p_data < v_kit.cedido_em then
    raise exception 'o kit está com você desde %; o abastecimento não pode ser de antes', _fmt_data(v_kit.cedido_em);
  end if;
  if p_nivel_cm is null or p_nivel_cm < 0 or p_nivel_cm > 200 then
    raise exception 'o nível deve estar entre 0 e 200 cm';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'informe o valor pago pelo abastecimento (maior que zero)';
  end if;
  if p_foto_path is null or p_foto_path not like 'kit/' || p_kit_id::text || '/%' then
    raise exception 'a foto do nível é obrigatória';
  end if;
  if exists (select 1 from botijao_abastecimentos where foto_path = p_foto_path) then
    raise exception 'essa foto já foi usada em outro abastecimento — tire uma foto nova da régua';
  end if;

  -- com a fazenda: despesa dela, como o botijão da fazenda (0058)
  if v_kit.propriedade_id is not null then
    insert into financeiro (propriedade_id, tipo, categoria, valor, data)
    values (v_kit.propriedade_id, 'despesa', _categoria_normalizada('inseminação artificial'), p_valor, p_data)
    returning id into v_fin;
  end if;

  insert into botijao_abastecimentos (propriedade_id, kit_id, data, nivel_cm, valor, foto_path, financeiro_id)
  values (v_kit.propriedade_id, p_kit_id, p_data, p_nivel_cm, p_valor, p_foto_path, v_fin)
  returning * into v_abast;

  return v_abast;
end;
$$;

revoke execute on function registrar_abastecimento_kit(uuid, date, numeric, numeric, text) from public, anon;
grant execute on function registrar_abastecimento_kit(uuid, date, numeric, numeric, text) to authenticated;

-- Excluir: a fazenda (como antes) ou o técnico que está com o kit
create or replace function excluir_abastecimento_botijao(p_abastecimento_id uuid) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_abast botijao_abastecimentos;
begin
  select * into v_abast from botijao_abastecimentos where id = p_abastecimento_id;

  if v_abast.id is null then
    raise exception 'abastecimento não encontrado';
  end if;

  if not (
    exists (
      select 1 from usuarios_propriedades
      where usuario_id = auth.uid() and propriedade_id = v_abast.propriedade_id
    )
    or exists (select 1 from kits_inseminacao k where k.id = v_abast.kit_id and k.tecnico_id = auth.uid())
  ) then
    raise exception 'sem acesso a este abastecimento';
  end if;

  delete from botijao_abastecimentos where id = v_abast.id;
  if v_abast.financeiro_id is not null then
    delete from financeiro where id = v_abast.financeiro_id and propriedade_id = v_abast.propriedade_id;
  end if;

  return v_abast.foto_path;
end;
$$;

-- ============================================================
-- 3. Alertas
-- ============================================================

-- Kits cedidos há mais de 60 dias sem abastecimento desde a cessão (ou desde o último). Só o painel
-- do gestor usa (service role).
create or replace function alertas_kits()
returns table (
  kit_id uuid,
  patrimonio text,
  entidade_nome text,
  propriedade_id uuid,
  tecnico_id uuid,
  com_quem text,
  telefone text,
  cedido_em date,
  recebido boolean,
  ultimo_abastecimento date,
  dias integer
)
language sql
stable
security definer
set search_path = public
as $$
  select k.id, k.patrimonio, e.nome, k.propriedade_id, k.tecnico_id,
         coalesce(p.nome_propriedade, _nome_usuario(u.raw_user_meta_data), u.email::text, 'Técnico'),
         coalesce(
           (select w.telefone from usuarios_whatsapp w
            where w.propriedade_id = k.propriedade_id and w.ativo order by w.created_at limit 1),
           u.raw_user_meta_data->>'telefone'
         ),
         k.cedido_em, k.recebido_em is not null, a.ultimo,
         _hoje_fazenda() - coalesce(a.ultimo, k.cedido_em)
  from kits_inseminacao k
  join entidades e on e.id = k.entidade_id
  left join propriedades p on p.id = k.propriedade_id
  left join auth.users u on u.id = k.tecnico_id
  left join lateral (
    select max(b.data) as ultimo from botijao_abastecimentos b
    where b.kit_id = k.id and b.data >= k.cedido_em
  ) a on true
  where (k.propriedade_id is not null or k.tecnico_id is not null)
    and k.cedido_em is not null
    and _hoje_fazenda() - coalesce(a.ultimo, k.cedido_em) > 60;
$$;

revoke execute on function alertas_kits() from public, anon, authenticated;

-- Botijão da FAZENDA (0064): a fazenda que está com kit é cobrada pelo kit (alertas_kits), não duas
-- vezes. Resto igual a 0064.
create or replace function alertas_reprodutivos()
returns table (propriedade_id uuid, tipo text, vaca_id uuid, numero integer, data_ref date, dias integer)
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (select _hoje_fazenda() as d),
  prenhes as (
    select v.propriedade_id, v.id as vaca_id, v.numero_identificacao, v.status_produtivo, c.data_cobertura
    from coberturas_atuais c join vacas v on v.id = c.vaca_id
    where c.diagnostico_prenhez = 'positivo'
  )
  select v.propriedade_id, 'diagnostico_atrasado', v.id, v.numero_identificacao, c.data_cobertura,
         (select d from hoje) - c.data_cobertura
  from coberturas_atuais c join vacas v on v.id = c.vaca_id
  where c.diagnostico_prenhez = 'pendente' and (select d from hoje) - c.data_cobertura > 45

  union all
  select propriedade_id, 'secagem_atrasada', vaca_id, numero_identificacao, data_cobertura + 223,
         (select d from hoje) - (data_cobertura + 223)
  from prenhes
  where status_produtivo = 'lactacao' and data_cobertura + 223 < (select d from hoje)

  union all
  select propriedade_id, 'parto_atrasado', vaca_id, numero_identificacao, data_cobertura + 283,
         (select d from hoje) - (data_cobertura + 283)
  from prenhes
  where (select d from hoje) - (data_cobertura + 283) > 15

  union all
  select v.propriedade_id, 'vazia_muito_tempo', v.id, v.numero_identificacao, p.data_parto,
         (select d from hoje) - p.data_parto
  from partos p join vacas v on v.id = p.vaca_id
  where p.ativa and v.status_produtivo = 'lactacao'
    and (select d from hoje) - p.data_parto > 120
    and not exists (
      select 1 from coberturas c
      where c.vaca_id = p.vaca_id and c.data_cobertura >= p.data_parto and c.diagnostico_prenhez = 'positivo'
    )

  union all
  select e.propriedade_id, 'doses_nao_confirmadas', null, null, e.data_entrega,
         (select d from hoje) - e.data_entrega
  from entregas_doses e
  where e.recebido_em is null and (select d from hoje) - e.data_entrega > 7

  union all
  select b.propriedade_id, 'botijao_sem_abastecer', null, null, max(b.data),
         (select d from hoje) - max(b.data)
  from botijao_abastecimentos b
  where b.propriedade_id is not null
    and not exists (select 1 from kits_inseminacao k where k.propriedade_id = b.propriedade_id)
  group by b.propriedade_id
  having (select d from hoje) - max(b.data) > 60;
$$;

revoke execute on function alertas_reprodutivos() from public, anon, authenticated;

-- botijao_situacao (0064) agrupa por fazenda: abastecimento de kit com técnico (sem fazenda) fica fora
create or replace view botijao_situacao with (security_invoker = true) as
select
  u.propriedade_id,
  u.data as ultimo_abastecimento,
  u.nivel_cm as ultimo_nivel_cm,
  _hoje_fazenda() - u.data as dias_desde,
  a.abastecimentos_12m,
  a.gasto_12m
from (
  select distinct on (propriedade_id) propriedade_id, data, nivel_cm
  from botijao_abastecimentos
  where propriedade_id is not null
  order by propriedade_id, data desc, created_at desc
) u
join (
  select propriedade_id,
         count(*) filter (where data > _hoje_fazenda() - 365)::integer as abastecimentos_12m,
         coalesce(sum(valor) filter (where data > _hoje_fazenda() - 365), 0) as gasto_12m
  from botijao_abastecimentos
  where propriedade_id is not null
  group by propriedade_id
) a on a.propriedade_id = u.propriedade_id;
