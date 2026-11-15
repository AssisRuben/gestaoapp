-- Limite diário de interações com o bot do WhatsApp, por fazenda.
--
-- Uma interação = cada vez que o bot manda a mensagem pra IA (mensagens em sequência rápida já
-- chegam juntas pelo buffer e contam como uma). A resposta SIM/NÃO de exclusão não passa pela IA,
-- não conta e nunca é bloqueada.
--
-- Padrão: 30 por dia (fuso de Fortaleza). O gestor pode dar outro limite a uma fazenda
-- (propriedades.limite_bot_dia; nulo = padrão). Todos os números de WhatsApp da fazenda dividem a
-- mesma cota.
--
-- Ao estourar, o bot avisa UMA vez no dia ("Avisar Limite?" no n8n) e depois fica em silêncio até
-- virar o dia — senão cada mensagem extra geraria mais uma resposta.

alter table propriedades add column if not exists limite_bot_dia integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'propriedades_limite_bot_dia_check') then
    alter table propriedades add constraint propriedades_limite_bot_dia_check
      check (limite_bot_dia is null or limite_bot_dia between 1 and 1000);
  end if;
end $$;

create or replace function _limite_bot_padrao() returns integer
language sql
immutable
as $$
  select 30;
$$;

-- Contador do dia. Só as funções abaixo leem e escrevem (RLS ligada, sem policy).
create table if not exists bot_uso_diario (
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  dia date not null,
  interacoes integer not null default 0,
  avisado boolean not null default false,
  primary key (propriedade_id, dia)
);

alter table bot_uso_diario enable row level security;

-- Chamada pelo n8n (nó "Consumir Interação (RPC)") antes da IA. Conta a interação se ainda há
-- cota; senão devolve ok=false e avisar=true só na primeira recusa do dia.
-- Número que não é de fazenda nenhuma passa (ok=true): quem barra isso é o "Acesso Liberado?".
create or replace function bot_consumir_interacao(p_telefone text) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_hoje date := _hoje_fazenda();
  v_limite integer;
  v_usadas integer;
  v_avisar boolean;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', true);
  end if;

  select coalesce(limite_bot_dia, _limite_bot_padrao()) into v_limite
  from propriedades where id = v_propriedade_id;

  -- atômico: duas mensagens ao mesmo tempo não passam do limite
  insert into bot_uso_diario as u (propriedade_id, dia, interacoes)
  values (v_propriedade_id, v_hoje, 1)
  on conflict (propriedade_id, dia) do update
    set interacoes = u.interacoes + 1
    where u.interacoes < v_limite
  returning u.interacoes into v_usadas;

  if v_usadas is not null then
    return jsonb_build_object('ok', true, 'usadas', v_usadas, 'limite', v_limite);
  end if;

  update bot_uso_diario set avisado = true
  where propriedade_id = v_propriedade_id and dia = v_hoje and not avisado
  returning true into v_avisar;

  return jsonb_build_object(
    'ok', false,
    'avisar', coalesce(v_avisar, false),
    'limite', v_limite,
    'mensagem', format(
      'Sua fazenda já usou as %s mensagens de hoje com o assistente do Gestão Pec. Amanhã libera de novo. '
      'Enquanto isso, dá pra lançar e consultar tudo pelo site do Gestão Pec.', v_limite)
  );
end;
$$;

revoke execute on function bot_consumir_interacao(text) from public, anon, authenticated;
grant execute on function bot_consumir_interacao(text) to service_role;

-- Painel do gestor (aba Acessos): uso de hoje e limite de cada fazenda.
create or replace function gestor_uso_bot()
returns table (
  propriedade_id uuid,
  nome_propriedade text,
  limite_proprio integer,
  limite integer,
  usadas_hoje integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not _eh_gestor() then
    raise exception 'apenas o gestor do programa pode ver o uso do bot';
  end if;

  return query
  select p.id, p.nome_propriedade, p.limite_bot_dia,
         coalesce(p.limite_bot_dia, _limite_bot_padrao()),
         coalesce(u.interacoes, 0)
  from propriedades p
  left join bot_uso_diario u on u.propriedade_id = p.id and u.dia = _hoje_fazenda()
  order by p.nome_propriedade, p.id;
end;
$$;

-- p_limite nulo = volta ao padrão.
create or replace function gestor_definir_limite_bot(p_propriedade_id uuid, p_limite integer) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not _eh_gestor() then
    raise exception 'apenas o gestor do programa pode mudar o limite do bot';
  end if;
  if p_limite is not null and (p_limite < 1 or p_limite > 1000) then
    raise exception 'o limite deve ficar entre 1 e 1000 interações por dia';
  end if;

  update propriedades set limite_bot_dia = p_limite where id = p_propriedade_id;
  if not found then
    raise exception 'fazenda não encontrada';
  end if;
end;
$$;

revoke execute on function gestor_uso_bot() from public, anon;
revoke execute on function gestor_definir_limite_bot(uuid, integer) from public, anon;
grant execute on function gestor_uso_bot() to authenticated;
grant execute on function gestor_definir_limite_bot(uuid, integer) to authenticated;
