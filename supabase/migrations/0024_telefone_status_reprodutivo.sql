-- Duas correções de integração site ↔ bot, achadas na auditoria de 2026-10-10.
--
-- 1. TELEFONE. O site gravava o WhatsApp como a pessoa digitou ("(85) 99814-9317") e o bot
--    procurava pelo número exato que o WhatsApp manda ("558598149317" — com 55 e, em muitos
--    números brasileiros, SEM o nono dígito). Resultado: quem cadastrava o número pelo site nunca
--    era reconhecido pelo bot. Agora:
--      - todo telefone é gravado só com dígitos e com o 55 (trigger, vale pro site e pro bot);
--      - a comparação usa uma "chave" que ignora o nono dígito, então 5585998149317 e
--        558598149317 são o mesmo número;
--      - o bot identifica o usuário por bot_identificar_usuario (nó "Identificar Usuario"), que
--        usa essa chave, e _propriedade_do_telefone (RPCs de 0022) também.
--
-- 2. STATUS REPRODUTIVO. Nada atualizava vacas.status_reprodutivo depois de cobertura ou
--    diagnóstico (só o parto, que volta pra 'vazia'), então o status — e o censo do rebanho —
--    só ficava certo se alguém editasse a vaca à mão. Agora um trigger em coberturas recalcula o
--    status a partir da cobertura mais recente da lactação atual:
--      sem cobertura → 'vazia' | pendente → 'vazia_em_servico' | positivo → 'prenhe' | negativo → 'vazia'
--    Por ser trigger, vale também pras escritas diretas do bot (diagnóstico pelo WhatsApp).
--    Edição manual do status na tela da vaca continua valendo até a próxima mudança de cobertura.

-- ============================================================
-- 1. Telefone
-- ============================================================

-- Só dígitos, com DDI 55 quando vier só DDD + número. Aceita o JID do WhatsApp ("...@s.whatsapp.net").
create or replace function _telefone_normalizado(p_telefone text) returns text
language sql
immutable
as $$
  select case
    when length(d) in (10, 11) then '55' || d
    else d
  end
  from (select regexp_replace(split_part(coalesce(p_telefone, ''), '@', 1), '\D', '', 'g') as d) x;
$$;

-- Chave de comparação: normalizado e sem o nono dígito do celular brasileiro (55 + DDD + 9 + 8 dígitos).
create or replace function _telefone_chave(p_telefone text) returns text
language sql
immutable
as $$
  select case
    when length(n) = 13 and n like '55%' and substr(n, 5, 1) = '9' then substr(n, 1, 4) || substr(n, 6)
    else n
  end
  from (select _telefone_normalizado(p_telefone) as n) x;
$$;

create or replace function _usuarios_whatsapp_normalizar() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.telefone := _telefone_normalizado(new.telefone);

  if length(new.telefone) < 12 then
    raise exception 'WhatsApp inválido. Informe com DDD, por exemplo (85) 99999-9999.';
  end if;

  if exists (
    select 1 from usuarios_whatsapp
    where id is distinct from new.id
      and _telefone_chave(telefone) = _telefone_chave(new.telefone)
  ) then
    raise exception 'Esse WhatsApp já está cadastrado em outra conta ou fazenda.';
  end if;

  return new;
end;
$$;

-- Normaliza o que já existe antes de ligar o trigger. Linha que colidiria com outra (mesmo número
-- escrito de dois jeitos) fica como está e aparece no aviso, pra resolver à mão.
do $$
declare
  r record;
begin
  for r in select id, telefone from usuarios_whatsapp order by created_at loop
    if r.telefone is distinct from _telefone_normalizado(r.telefone) then
      if exists (
        select 1 from usuarios_whatsapp
        where id <> r.id and _telefone_chave(telefone) = _telefone_chave(r.telefone)
      ) then
        raise notice 'telefone % (usuarios_whatsapp.id %) duplica outro cadastro — não normalizado', r.telefone, r.id;
      else
        begin
          update usuarios_whatsapp set telefone = _telefone_normalizado(r.telefone) where id = r.id;
        exception when unique_violation then
          raise notice 'telefone % (usuarios_whatsapp.id %) colide com outro — não normalizado', r.telefone, r.id;
        end;
      end if;
    end if;
  end loop;
end $$;

drop trigger if exists usuarios_whatsapp_normalizar on usuarios_whatsapp;
create trigger usuarios_whatsapp_normalizar
  before insert or update of telefone on usuarios_whatsapp
  for each row execute function _usuarios_whatsapp_normalizar();

create index if not exists idx_usuarios_whatsapp_chave on usuarios_whatsapp (_telefone_chave(telefone));

-- Igual a 0013, mas WhatsApp inválido ou já usado não derruba mais o cadastro inteiro (o erro do
-- trigger acima, dentro do trigger de auth.users, virava um "Database error saving new user"
-- genérico): a conta e a fazenda são criadas e o número fica pra ser acertado no modal da fazenda.
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

  insert into propriedades (nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel)
  values (v_nome_propriedade, v_nome_produtor, v_municipio, v_estado, v_tecnico_responsavel)
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

  return new;
end;
$$;

create or replace function _propriedade_do_telefone(p_telefone text) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select propriedade_id from usuarios_whatsapp
  where _telefone_chave(telefone) = _telefone_chave(p_telefone) and ativo
  limit 1;
$$;

revoke execute on function _propriedade_do_telefone(text) from public, anon, authenticated;

-- Usado pelo nó "Identificar Usuario" do bot. Sempre devolve um objeto ({} quando não acha), pra o
-- n8n seguir com um item e o nó "Verificar Status Usuário" decidir. Usuário ativo tem prioridade.
create or replace function bot_identificar_usuario(p_remote_jid text) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select to_jsonb(u) from usuarios_whatsapp u
      where _telefone_chave(u.telefone) = _telefone_chave(p_remote_jid)
      order by u.ativo desc, u.created_at
      limit 1
    ),
    '{}'::jsonb
  );
$$;

revoke execute on function bot_identificar_usuario(text) from public, anon, authenticated;
grant execute on function bot_identificar_usuario(text) to service_role;

-- ============================================================
-- 2. Status reprodutivo derivado das coberturas
-- ============================================================

create or replace function _recalcular_status_reprodutivo(p_vaca_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desde date;
  v_diagnostico text;
  v_status text;
begin
  -- só conta a lactação atual: cobertura de antes do parto ativo já virou passado
  select data_parto into v_desde
  from partos where vaca_id = p_vaca_id and ativa
  order by data_parto desc limit 1;

  select diagnostico_prenhez into v_diagnostico
  from coberturas
  where vaca_id = p_vaca_id and (v_desde is null or data_cobertura >= v_desde)
  order by data_cobertura desc, created_at desc
  limit 1;

  v_status := case
    when not found then 'vazia'
    when v_diagnostico = 'positivo' then 'prenhe'
    when v_diagnostico = 'negativo' then 'vazia'
    else 'vazia_em_servico'
  end;

  update vacas set status_reprodutivo = v_status
  where id = p_vaca_id and status_reprodutivo is distinct from v_status;
end;
$$;

revoke execute on function _recalcular_status_reprodutivo(uuid) from public, anon, authenticated;

create or replace function _coberturas_status_reprodutivo() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform _recalcular_status_reprodutivo(new.vaca_id);
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.vaca_id is distinct from new.vaca_id) then
    perform _recalcular_status_reprodutivo(old.vaca_id);
  end if;
  return null;
end;
$$;

drop trigger if exists coberturas_status_reprodutivo on coberturas;
create trigger coberturas_status_reprodutivo
  after insert or delete or update of diagnostico_prenhez, data_cobertura, vaca_id on coberturas
  for each row execute function _coberturas_status_reprodutivo();

-- Acerta o que já existe, mas só nas vacas que têm cobertura na lactação atual: vaca sem cobertura
-- registrada (ex.: comprada prenhe, status posto à mão) fica como está.
do $$
declare
  r record;
  v_qtd integer := 0;
begin
  for r in
    select distinct c.vaca_id
    from coberturas c
    left join partos p on p.vaca_id = c.vaca_id and p.ativa
    where p.id is null or c.data_cobertura >= p.data_parto
  loop
    perform _recalcular_status_reprodutivo(r.vaca_id);
    v_qtd := v_qtd + 1;
  end loop;
  raise notice 'status reprodutivo recalculado em % vacas', v_qtd;
end $$;
