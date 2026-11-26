-- WhatsApp: cadastrar vaca/bezerra pelo NOME ("Malu, uma bezerra, filha da Graúna").
--
-- Fazenda Sousa, 26/11/2026: a IA entendeu certo (cadastrar_vaca, nome_vaca "Malu", nome_mae
-- "graúna"), mas o "Resolver Vaca pelo Nome" (0061) procurava a Malu no rebanho como se fosse uma
-- vaca existente e respondia "Não achei vaca chamada Malu". E mesmo passando dali, o cadastro pelo
-- WhatsApp não gravava nome nenhum.
--
--   1. bot_resolver_vacas ganha p_intencao: no cadastrar_vaca, nome_vaca é o nome da vaca NOVA e não
--      é procurado (a mãe pelo nome continua sendo).
--   2. bot_cadastrar_vaca ganha p_nome (opcional; o n8n antigo, sem ele, continua funcionando). Nome
--      que já é de outra vaca da fazenda é recusado — o bot acha a vaca pelo nome, dois iguais travam.
--   3. Filha de vaca da fazenda sem número falado fica com o NÚMERO DA BEZERRA dela (o registro do
--      parto já numerou a cria). Antes ganhava o próximo número livre e era ligada à bezerra de outro
--      número (Malu viraria vaca 14 ligada à bezerra 11). Vale pro site também (_cadastrar_vaca).
--      Mãe com duas bezerras sem cadastro: o bot pergunta qual (pelo número), não adivinha.
--   4. A ligação vaca ↔ bezerro pela mãe (sem número) não pega mais bezerro macho/natimorto.
--
-- Regra do cadastro do bot = _bot_cadastrar_vaca_sem_nome (ver 0066); bot_cadastrar_vaca só põe o
-- nome das vacas na resposta.

-- ============================================================
-- 1. Resolver nomes: no cadastro, o nome da vaca nova não é procurado
-- ============================================================

drop function if exists bot_resolver_vacas(text, jsonb);

create or replace function bot_resolver_vacas(p_telefone text, p_entidades jsonb, p_intencao text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_ent jsonb := coalesce(p_entidades, '{}'::jsonb);
  v_campo record;
  v_nome text;
  v_numeros integer[];
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  for v_campo in
    select * from (values ('nome_vaca', 'numero_vaca', 'vaca'), ('nome_mae', 'numero_mae', 'mãe')) as t(campo_nome, campo_numero, papel)
  loop
    -- cadastro: o nome da vaca é o da vaca nova, ainda não está no rebanho
    if v_campo.papel = 'vaca' and p_intencao = 'cadastrar_vaca' then
      continue;
    end if;

    v_nome := nullif(trim(coalesce(v_ent->>v_campo.campo_nome, '')), '');
    -- sem nome, ou o número já veio: nada a resolver
    if v_nome is null or nullif(trim(coalesce(v_ent->>v_campo.campo_numero, '')), '') is not null then
      continue;
    end if;

    -- "vaca 12" escrito no lugar do nome
    if v_nome ~ '^\d{1,9}$' then
      v_ent := jsonb_set(v_ent, array[v_campo.campo_numero], to_jsonb(v_nome));
      continue;
    end if;

    select array_agg(numero_identificacao order by numero_identificacao) into v_numeros
    from vacas
    where propriedade_id = v_propriedade_id and _nome_chave(nome) = _nome_chave(v_nome);

    if v_numeros is null then
      return jsonb_build_object('ok', false, 'mensagem',
        case when v_campo.papel = 'mãe'
          then format('Não achei a mãe "%s" no rebanho. Mande o número do brinco dela, por exemplo "filha da vaca 12".', v_nome)
          else format('Não achei vaca chamada "%s" no rebanho. Mande o número do brinco, por exemplo "vaca 12".', v_nome)
        end);
    end if;

    if array_length(v_numeros, 1) > 1 then
      return jsonb_build_object('ok', false, 'mensagem',
        format('Tem mais de uma vaca chamada "%s" (números %s). Qual delas? Mande o número.',
          v_nome, array_to_string(v_numeros, ', ', '')));
    end if;

    v_ent := jsonb_set(v_ent, array[v_campo.campo_numero], to_jsonb(v_numeros[1]::text));
  end loop;

  return jsonb_build_object('ok', true, 'entidades', v_ent);
end;
$$;

revoke execute on function bot_resolver_vacas(text, jsonb, text) from public, anon, authenticated;
grant execute on function bot_resolver_vacas(text, jsonb, text) to service_role;

-- ============================================================
-- 3 e 4. Cadastro (site e bot): filha fica com o número da bezerra
-- ============================================================

-- Bezerras da mãe que ainda podem virar vaca com o próprio número: sem vaca ligada, numeradas, não
-- macho/natimorto, e com o número livre entre as vacas. Mais recente primeiro.
create or replace function _bezerras_sem_vaca(p_propriedade_id uuid, p_mae_id uuid)
returns table (bezerro_id uuid, numero integer)
language sql
stable
set search_path = public
as $$
  select b.id, b.numero_identificacao
  from bezerros b
  where b.mae_id = p_mae_id
    and b.vaca_id_gerada is null
    and b.numero_identificacao is not null
    and coalesce(b.sexo, 'femea') = 'femea'
    and not exists (
      select 1 from vacas v
      where v.propriedade_id = p_propriedade_id and v.numero_identificacao = b.numero_identificacao
    )
  order by b.data_nascimento desc nulls last, b.created_at desc;
$$;

revoke execute on function _bezerras_sem_vaca(uuid, uuid) from public, anon, authenticated;

create or replace function _cadastrar_vaca(
  p_propriedade_id uuid,
  p_numero_identificacao integer,
  p_mae_id uuid,
  p_status_produtivo text,
  p_status_reprodutivo text
) returns vacas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_numero integer;
  v_vaca vacas;
  v_bezerro_id uuid;
begin
  if p_numero_identificacao is null then
    -- filha de vaca da fazenda: a vaca nova é a bezerra que o parto registrou — mesmo número
    if p_mae_id is not null then
      select numero into v_numero from _bezerras_sem_vaca(p_propriedade_id, p_mae_id) limit 1;
    end if;
    if v_numero is null then
      select coalesce(greatest(
        (select max(numero_identificacao) from vacas where propriedade_id = p_propriedade_id),
        (select max(numero_identificacao) from bezerros where propriedade_id = p_propriedade_id)
      ), 0) + 1 into v_numero;
    end if;
  else
    v_numero := p_numero_identificacao;
    -- bezerro com esse número ainda sem vínculo não é conflito: é a promoção esperada
    if exists (
      select 1 from vacas
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
    ) or exists (
      select 1 from bezerros
      where propriedade_id = p_propriedade_id and numero_identificacao = v_numero
        and vaca_id_gerada is not null
    ) then
      raise exception 'já existe uma vaca com o número %', v_numero;
    end if;
  end if;

  insert into vacas (propriedade_id, mae_id, numero_identificacao, status_produtivo, status_reprodutivo)
  values (p_propriedade_id, p_mae_id, v_numero, p_status_produtivo, p_status_reprodutivo)
  returning * into v_vaca;

  if p_mae_id is not null then
    select id into v_bezerro_id from bezerros
    where mae_id = p_mae_id and numero_identificacao = v_numero and vaca_id_gerada is null
    limit 1;

    -- bezerro antigo, sem número: o mais recente da mãe (nunca macho nem natimorto)
    if v_bezerro_id is null then
      select id into v_bezerro_id from bezerros
      where mae_id = p_mae_id and vaca_id_gerada is null
        and coalesce(sexo, 'femea') = 'femea'
      order by created_at desc limit 1;
    end if;

    if v_bezerro_id is not null then
      update bezerros set vaca_id_gerada = v_vaca.id where id = v_bezerro_id;
    end if;
  end if;

  return v_vaca;
end;
$$;

revoke execute on function _cadastrar_vaca(uuid, integer, uuid, text, text) from public, anon, authenticated;

-- ============================================================
-- 2. Cadastro pelo WhatsApp com nome
-- ============================================================

drop function if exists bot_cadastrar_vaca(text, integer, integer, text, text, text);
drop function if exists _bot_cadastrar_vaca_sem_nome(text, integer, integer, text, text, text);

create or replace function _bot_cadastrar_vaca_sem_nome(
  p_telefone text,
  p_numero_vaca integer,
  p_numero_mae integer,
  p_origem text,
  p_status_produtivo text,
  p_status_reprodutivo text,
  p_nome text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_comprada boolean := _texto_comparavel(p_origem) = 'comprada';
  v_mae_id uuid;
  v_produtivo text := case when p_status_produtivo in ('novilha', 'lactacao', 'seca') then p_status_produtivo else 'novilha' end;
  v_reprodutivo text := case when p_status_reprodutivo in ('vazia', 'prenhe', 'vazia_em_servico') then p_status_reprodutivo else 'vazia' end;
  v_nome text := nullif(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g'), '');
  v_outra integer;
  v_bezerras integer[];
  v_vaca vacas;
  v_bezerro bezerros;
  v_msg text;
begin
  if v_propriedade_id is null then
    return jsonb_build_object('ok', false, 'mensagem',
      'Seu número não está liberado no sistema. Fale com o técnico responsável.');
  end if;

  -- nome igual ao de outra vaca: o bot não saberia mais de qual delas o produtor fala
  if v_nome is not null then
    select numero_identificacao into v_outra from vacas
    where propriedade_id = v_propriedade_id and _nome_chave(nome) = _nome_chave(v_nome)
    order by numero_identificacao limit 1;
    if v_outra is not null then
      return jsonb_build_object('ok', false, 'mensagem',
        format('Já tem a vaca %s com o nome "%s" — não cadastrei de novo. Se for outro animal, mande com outro nome ou com o número do brinco.',
          v_outra, v_nome));
    end if;
  end if;

  -- mãe de animal comprado não está nesta fazenda: nunca vincula
  if p_numero_mae is not null and not v_comprada then
    select id into v_mae_id from vacas
    where propriedade_id = v_propriedade_id and numero_identificacao = p_numero_mae;
  end if;

  -- sem número e a mãe tem mais de uma bezerra sem cadastro: pergunta qual é
  if p_numero_vaca is null and v_mae_id is not null then
    select array_agg(numero order by numero) into v_bezerras
    from _bezerras_sem_vaca(v_propriedade_id, v_mae_id);
    if array_length(v_bezerras, 1) > 1 then
      return jsonb_build_object('ok', false, 'mensagem',
        format('A vaca %s tem %s bezerras ainda sem cadastro (números %s). %s é qual delas? Mande de novo com o número, por exemplo "%s, número %s, filha da vaca %s".',
          p_numero_mae, array_length(v_bezerras, 1), array_to_string(v_bezerras, ', '),
          coalesce(v_nome, 'A nova'), coalesce(v_nome, 'novilha'), v_bezerras[1], p_numero_mae));
    end if;
  end if;

  begin
    v_vaca := _cadastrar_vaca(v_propriedade_id, p_numero_vaca, v_mae_id, v_produtivo, v_reprodutivo);
    if v_nome is not null then
      update vacas set nome = v_nome where id = v_vaca.id returning * into v_vaca;
    end if;
  exception when others then
    if sqlerrm ilike 'já existe uma vaca%' then
      return jsonb_build_object('ok', false, 'mensagem',
        format('A vaca %s já está cadastrada nessa propriedade.', p_numero_vaca));
    end if;
    return jsonb_build_object('ok', false, 'mensagem',
      format('Não consegui cadastrar a vaca: %s.', sqlerrm));
  end;

  select * into v_bezerro from bezerros where vaca_id_gerada = v_vaca.id limit 1;

  v_msg := format('Vaca %s%s cadastrada (%s).', v_vaca.numero_identificacao,
    case
      when p_numero_vaca is not null then ''
      when v_bezerro.numero_identificacao = v_vaca.numero_identificacao then ' (mesmo número da bezerra)'
      else ' (número gerado automaticamente)'
    end,
    _rotulo_status(v_produtivo));
  if v_mae_id is not null then
    v_msg := v_msg || format(' Filha da vaca %s%s.', p_numero_mae,
      case when v_bezerro.id is not null then ', vinculada ao registro de nascimento' else '' end);
  elsif p_numero_mae is not null and not v_comprada then
    v_msg := v_msg || format(' Não achei a vaca %s pra registrar como mãe — cadastrei sem mãe. Corrija pelo site se precisar.', p_numero_mae);
  end if;

  return jsonb_build_object('ok', true, 'mensagem', v_msg, 'numero', v_vaca.numero_identificacao);
end;
$$;

revoke execute on function _bot_cadastrar_vaca_sem_nome(text, integer, integer, text, text, text, text) from public, anon, authenticated;

create or replace function bot_cadastrar_vaca(
  p_telefone text,
  p_numero_vaca integer,
  p_numero_mae integer,
  p_origem text,
  p_status_produtivo text,
  p_status_reprodutivo text,
  p_nome text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resposta jsonb;
begin
  v_resposta := _bot_cadastrar_vaca_sem_nome(p_telefone, p_numero_vaca, p_numero_mae, p_origem,
    p_status_produtivo, p_status_reprodutivo, p_nome);
  return _bot_resposta_com_nome(p_telefone, v_resposta);
end;
$$;

revoke execute on function bot_cadastrar_vaca(text, integer, integer, text, text, text, text) from public, anon, authenticated;
grant execute on function bot_cadastrar_vaca(text, integer, integer, text, text, text, text) to service_role;
