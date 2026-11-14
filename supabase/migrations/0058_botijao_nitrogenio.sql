-- Abastecimento do botijão de nitrogênio (tela Reprodução).
--
-- Cada fazenda tem um botijão. O abastecimento guarda nível em cm (lido na régua), data, valor pago
-- e a FOTO (obrigatória — é a prova da medida). Produtor e técnico da fazenda lançam e apagam.
--
-- O valor entra também no Financeiro, como despesa ("inseminação artificial"), na MESMA transação
-- da função — o produtor não digita duas vezes e apagar o abastecimento apaga a despesa junto.
--
-- Foto: bucket privado 'botijao' do Storage, caminho "<propriedade_id>/<arquivo>". O site envia e
-- lê com a service role (URL assinada de 1h, depois de conferir o acesso à fazenda); não há
-- policy de Storage de propósito — nada é lido direto pelo navegador.

create table if not exists botijao_abastecimentos (
  id uuid primary key default gen_random_uuid(),
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  data date not null,
  nivel_cm numeric not null check (nivel_cm >= 0 and nivel_cm <= 200),
  valor numeric not null check (valor > 0),
  foto_path text not null,
  financeiro_id uuid references financeiro(id) on delete set null,
  created_at timestamptz not null default now(),
  -- autoria (0030): preenchida pelo trigger abaixo
  criado_por uuid references auth.users(id) on delete set null,
  criado_via text,
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz
);

create index if not exists idx_botijao_propriedade_data on botijao_abastecimentos (propriedade_id, data desc);

drop trigger if exists autoria on botijao_abastecimentos;
create trigger autoria before insert or update on botijao_abastecimentos
  for each row execute function _autoria_preencher();

alter table botijao_abastecimentos enable row level security;

-- Só leitura via RLS; escrita só pelas funções abaixo.
drop policy if exists "fazenda e gestor veem abastecimentos do botijao" on botijao_abastecimentos;
create policy "fazenda e gestor veem abastecimentos do botijao"
  on botijao_abastecimentos for select
  using (
    exists (
      select 1 from usuarios_propriedades up
      where up.propriedade_id = botijao_abastecimentos.propriedade_id and up.usuario_id = auth.uid()
    )
    or exists (select 1 from gestores g where g.usuario_id = auth.uid())
  );

-- Bucket privado. O schema storage só existe no Supabase (não no banco de teste/PGlite).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('botijao', 'botijao', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

-- Regra única (site e bot): valida, grava o abastecimento e a despesa. Sem checagem de acesso —
-- quem chama (registrar_abastecimento_botijao no site, bot_registrar_botijao no WhatsApp) já
-- identificou a fazenda.
create or replace function _registrar_abastecimento_botijao(
  p_propriedade_id uuid,
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
  v_fin uuid;
  v_abast botijao_abastecimentos;
begin
  if p_data is null then
    raise exception 'informe a data do abastecimento';
  end if;
  if p_data > _hoje_fazenda() then
    raise exception 'a data do abastecimento não pode ser no futuro';
  end if;
  if p_nivel_cm is null or p_nivel_cm < 0 or p_nivel_cm > 200 then
    raise exception 'o nível deve estar entre 0 e 200 cm';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'informe o valor pago pelo abastecimento (maior que zero)';
  end if;
  -- a foto é obrigatória e tem que estar na pasta da própria fazenda
  if p_foto_path is null or p_foto_path not like p_propriedade_id::text || '/%' then
    raise exception 'a foto do nível é obrigatória';
  end if;
  -- cada foto vale um abastecimento só (o bot guarda a última foto por alguns minutos)
  if exists (select 1 from botijao_abastecimentos where foto_path = p_foto_path) then
    raise exception 'essa foto já foi usada em outro abastecimento — tire uma foto nova da régua';
  end if;

  insert into financeiro (propriedade_id, tipo, categoria, valor, data)
  values (p_propriedade_id, 'despesa', _categoria_normalizada('inseminação artificial'), p_valor, p_data)
  returning id into v_fin;

  insert into botijao_abastecimentos (propriedade_id, data, nivel_cm, valor, foto_path, financeiro_id)
  values (p_propriedade_id, p_data, p_nivel_cm, p_valor, p_foto_path, v_fin)
  returning * into v_abast;

  return v_abast;
end;
$$;

revoke execute on function _registrar_abastecimento_botijao(uuid, date, numeric, numeric, text) from public, anon, authenticated;

create or replace function registrar_abastecimento_botijao(
  p_propriedade_id uuid,
  p_data date,
  p_nivel_cm numeric,
  p_valor numeric,
  p_foto_path text
) returns botijao_abastecimentos
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

  return _registrar_abastecimento_botijao(p_propriedade_id, p_data, p_nivel_cm, p_valor, p_foto_path);
end;
$$;

-- Apaga o abastecimento e a despesa que ele gerou. Devolve o caminho da foto pra o site remover
-- o arquivo do Storage.
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

  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = v_abast.propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  delete from botijao_abastecimentos where id = v_abast.id;
  if v_abast.financeiro_id is not null then
    delete from financeiro where id = v_abast.financeiro_id and propriedade_id = v_abast.propriedade_id;
  end if;

  return v_abast.foto_path;
end;
$$;

revoke execute on function registrar_abastecimento_botijao(uuid, date, numeric, numeric, text) from public, anon;
revoke execute on function excluir_abastecimento_botijao(uuid) from public, anon;
grant execute on function registrar_abastecimento_botijao(uuid, date, numeric, numeric, text) to authenticated;
grant execute on function excluir_abastecimento_botijao(uuid) to authenticated;

-- ============================================================
-- WhatsApp: "abasteci o botijão, 42 cm, 180 reais" + foto da régua
-- ============================================================

-- "42,5", "42.5", "1.234,50" → número; vazio/ruim → null
create or replace function _numero_do_texto(p_texto text) returns numeric
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_texto, '')), '') is null then null
    when trim(p_texto) ~ '^\d{1,3}(\.\d{3})*,\d+$' then replace(replace(trim(p_texto), '.', ''), ',', '.')::numeric
    when trim(p_texto) ~ '^\d+,\d+$' then replace(trim(p_texto), ',', '.')::numeric
    when trim(p_texto) ~ '^\d+(\.\d+)?$' then trim(p_texto)::numeric
    else null
  end;
$$;

-- p_entidades: nivel_cm, valor, data (opcional, padrão hoje) e foto_path — o caminho que o n8n
-- gravou no Storage quando chegou a foto (guardado alguns minutos no Redis). Devolve {ok, mensagem}.
create or replace function bot_registrar_botijao(p_telefone text, p_entidades jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_nivel numeric := _numero_do_texto(p_entidades->>'nivel_cm');
  v_valor numeric := _numero_do_texto(p_entidades->>'valor');
  v_data date;
  v_foto text := nullif(trim(coalesce(p_entidades->>'foto_path', '')), '');
  v_abast botijao_abastecimentos;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if v_nivel is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Qual o nível do botijão na régua, em cm? Me diga por texto ou áudio, por exemplo: "abasteci o botijão, nível 42 cm, 180 reais".');
  end if;
  if v_valor is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Quanto você pagou pelo abastecimento? Me diga por texto ou áudio, por exemplo: "abasteci o botijão, nível 42 cm, 180 reais".');
  end if;
  if v_foto is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Preciso da foto da régua do botijão. Mande a foto (com a legenda "abasteci o botijão, nível 42 cm, 180 reais" ou sem legenda, e depois me diga o nível e o valor). A foto vale por 15 minutos.');
  end if;

  begin
    v_data := coalesce(nullif(p_entidades->>'data', '')::date, _hoje_fazenda());
  exception when others then
    v_data := _hoje_fazenda();
  end;

  begin
    v_abast := _registrar_abastecimento_botijao(v_propriedade_id, v_data, v_nivel, v_valor, v_foto);
  exception when others then
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não registrei o abastecimento: %s.', sqlerrm));
  end;

  return jsonb_build_object('ok', true, 'mensagem',
    format('Abastecimento do botijão registrado: %s, nível %s cm, %s. A despesa também foi lançada no Financeiro.',
      _fmt_data(v_abast.data), _fmt_num(v_abast.nivel_cm), _fmt_reais(v_abast.valor)));
end;
$$;

revoke execute on function bot_registrar_botijao(text, jsonb) from public, anon, authenticated;
grant execute on function bot_registrar_botijao(text, jsonb) to service_role;

-- bot_acao de 0043 + ramo registrar_botijao
create or replace function bot_acao(p_telefone text, p_acao text, p_entidades jsonb) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_acao text := lower(coalesce(p_acao, ''));
  v_alvo text := _texto_comparavel(p_entidades->>'touro_semen');
  v_lista text;
  v_qtd integer;
  v_numero integer;
  v_bezerro bezerros;
  v_vaca vacas;
  v_mae integer;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  if v_acao = 'confirmar_doses' then
    -- confirma as entregas pendentes (só as do touro falado, se ele disse qual)
    with confirmadas as (
      update entregas_doses e set recebido_em = now(), recebido_por = null
      from touros t
      where t.id = e.touro_id and e.propriedade_id = v_propriedade_id and e.recebido_em is null
        and (v_alvo = '' or _texto_comparavel(t.nome) = v_alvo or _texto_comparavel(t.codigo) = v_alvo)
      returning e.quantidade, t.nome, e.data_entrega
    )
    select string_agg(format('%s doses do touro %s (entregues em %s)', quantidade, nome, _fmt_data(data_entrega)), '; '), count(*)
    into v_lista, v_qtd
    from confirmadas;

    if v_qtd = 0 then
      return jsonb_build_object('ok', false, 'mensagem',
        case when v_alvo <> '' then 'Não achei entrega desse touro esperando confirmação. Pergunte "quantas doses eu tenho" pra ver as pendentes.'
             else 'Não há entrega de doses esperando confirmação.' end);
    end if;
    return jsonb_build_object('ok', true, 'mensagem',
      format('Recebimento confirmado: %s. As doses já entram no saldo.', v_lista));

  elsif v_acao = 'ligar_lembretes' then
    return jsonb_build_object('ok', false, 'mensagem',
      'Os lembretes automáticos ainda não estão disponíveis. Pra ver as pendências (secar, diagnóstico, partos), pergunte aqui "relatório reprodutivo" ou abra o Início no site.');

  elsif v_acao = 'desligar_lembretes' then
    update propriedades set lembretes_whatsapp = false where id = v_propriedade_id;
    return jsonb_build_object('ok', true, 'mensagem', 'Pode deixar: não envio lembretes automáticos.');

  elsif v_acao = 'promover_bezerro' then
    v_numero := nullif(regexp_replace(coalesce(p_entidades->>'numero_bezerro', p_entidades->>'numero_vaca', ''), '\D', '', 'g'), '')::integer;
    if v_numero is null then
      return jsonb_build_object('ok', false, 'mensagem', 'Me diga o número da bezerra, por exemplo: "a bezerra 105 virou vaca".');
    end if;
    select * into v_bezerro from bezerros
    where propriedade_id = v_propriedade_id and numero_identificacao = v_numero
    order by (vaca_id_gerada is null) desc, created_at desc
    limit 1;
    if v_bezerro.id is null then
      return jsonb_build_object('ok', false, 'mensagem', format('Não achei a bezerra %s no cadastro.', v_numero));
    end if;
    begin
      v_vaca := _promover_bezerro(v_bezerro.id);
    exception when others then
      return jsonb_build_object('ok', false, 'mensagem', format('Não cadastrei a bezerra %s como vaca: %s.', v_numero, sqlerrm));
    end;
    select numero_identificacao into v_mae from vacas where id = v_vaca.mae_id;
    return jsonb_build_object('ok', true, 'mensagem',
      format('Bezerra %s cadastrada como vaca (novilha)%s.', v_vaca.numero_identificacao,
        coalesce(format(' — filha da vaca %s', v_mae), '')));

  elsif v_acao = 'registrar_botijao' then
    return bot_registrar_botijao(p_telefone, p_entidades);

  else
    return jsonb_build_object('ok', false, 'mensagem',
      'Não entendi o que fazer. Posso confirmar doses recebidas, cadastrar uma bezerra como vaca e registrar o abastecimento do botijão de nitrogênio.');
  end if;
end;
$$;

revoke execute on function bot_acao(text, text, jsonb) from public, anon, authenticated;
grant execute on function bot_acao(text, text, jsonb) to service_role;
