-- Importação do rebanho por planilha (entrada das fazendas, 11/10/2026) + nome opcional da vaca.
--
-- importar_rebanho(propriedade, dados, modo): dados = {vacas, bezerros, leite}, cada um uma lista de
-- linhas já lidas da planilha pelo site (datas em AAAA-MM-DD; erro de formato vem em "erro").
--   modo 'validar'     → faz tudo e DESFAZ no fim: a prévia mostra exatamente o que a importação faria.
--   modo 'importar'    → grava só se nenhuma linha tiver erro (tudo ou nada).
--   modo 'importar_ok' → grava as linhas certas e devolve as com erro.
-- Cada linha roda num bloco próprio: erro numa linha não derruba as outras. Devolve
-- {ok, importado, erros: [{aba, linha, mensagem}], contagem}.
--
-- Vaca: número (obrigatório, novo na fazenda), nome, situação (lactacao|seca|novilha), mãe (número
--   na fazenda ou na planilha), parto atual (obrigatório em lactação; vira o parto ativo), bezerro
--   desse parto SÓ se a planilha informar (número/sexo), última cobertura (data ≥ parto atual),
--   touro e diagnóstico (positivo|negativo|pendente; "prenhe" exige data de cobertura).
-- Bezerro: número (novo entre vacas e bezerros), sexo, nascimento, mãe (opcional, precisa existir).
-- Leite: da lactação ATUAL (data ≥ parto ativo), litros 0–100, ordenha opcional, sem repetir a mesma
--   ordenha no dia. Não aplica a trava de vaca seca: é histórico de quando ela produzia.
-- Quem pode: quem tem vínculo com a fazenda (produtor ou técnico). O gestor não lança dados.

alter table vacas add column if not exists nome text;

create or replace function definir_nome_vaca(p_vaca_id uuid, p_nome text) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from vacas v join usuarios_propriedades up on up.propriedade_id = v.propriedade_id
    where v.id = p_vaca_id and up.usuario_id = auth.uid()
  ) then
    raise exception 'sem acesso a esta vaca';
  end if;
  update vacas set nome = nullif(trim(p_nome), '') where id = p_vaca_id and nome is distinct from nullif(trim(p_nome), '');
end;
$$;

revoke execute on function definir_nome_vaca(uuid, text) from public, anon;
grant execute on function definir_nome_vaca(uuid, text) to authenticated;

create or replace function _import_int(p_valor text, p_campo text) returns integer
language plpgsql
immutable
as $$
begin
  if p_valor is null or trim(p_valor) = '' then
    return null;
  end if;
  if trim(p_valor) !~ '^\d{1,9}$' then
    raise exception '% "%" não é um número inteiro', p_campo, p_valor;
  end if;
  return trim(p_valor)::integer;
end;
$$;

create or replace function _import_data(p_valor text, p_campo text) returns date
language plpgsql
stable
as $$
declare
  v date;
begin
  if p_valor is null or trim(p_valor) = '' then
    return null;
  end if;
  if trim(p_valor) !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception '% inválida (%)', p_campo, p_valor;
  end if;
  v := trim(p_valor)::date;
  if v > public._hoje_fazenda() then
    raise exception '% (%) ainda não chegou', p_campo, to_char(v, 'DD/MM/YYYY');
  end if;
  return v;
end;
$$;

create or replace function importar_rebanho(p_propriedade_id uuid, p_dados jsonb, p_modo text default 'validar')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_linha integer;
  v_erros jsonb := '[]';
  v_falhas integer[] := '{}';
  v_desfeito boolean := false;
  v_ok_vacas integer := 0;
  v_ok_bezerros integer := 0;
  v_ok_leite integer := 0;
  v_numero integer;
  v_situacao text;
  v_vaca_id uuid;
  v_mae_id uuid;
  v_parto_id uuid;
  v_data_parto date;
  v_data_cob date;
  v_data date;
  v_diag text;
  v_sexo text;
  v_bez_numero integer;
  v_litros numeric;
  v_periodo text;
begin
  if not exists (
    select 1 from usuarios_propriedades where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;
  if p_modo not in ('validar', 'importar', 'importar_ok') then
    raise exception 'modo de importação inválido';
  end if;

  begin
    -- ---------------- vacas (sem a mãe; ela pode estar mais abaixo na planilha) ----------------
    for r in select * from jsonb_array_elements(coalesce(p_dados->'vacas', '[]'::jsonb)) loop
      v_linha := (r->>'linha')::integer;
      begin
        if r->>'erro' is not null then raise exception '%', r->>'erro'; end if;

        v_numero := _import_int(r->>'numero', 'Número');
        if v_numero is null then raise exception 'falta o número da vaca'; end if;
        if exists (select 1 from vacas where propriedade_id = p_propriedade_id and numero_identificacao = v_numero) then
          raise exception 'a vaca % já existe (na fazenda ou mais acima na planilha)', v_numero;
        end if;

        v_situacao := lower(coalesce(r->>'situacao', ''));
        if v_situacao not in ('lactacao', 'seca', 'novilha') then
          raise exception 'situação "%" inválida — use lactação, seca ou novilha', coalesce(r->>'situacao', '');
        end if;

        v_data_parto := _import_data(r->>'data_parto', 'Data do parto');
        if v_situacao = 'lactacao' and v_data_parto is null then
          raise exception 'vaca em lactação precisa da data do último parto (pode ser aproximada)';
        end if;
        if v_situacao = 'novilha' and v_data_parto is not null then
          raise exception 'novilha não tem parto — se ela já pariu, a situação é lactação ou seca';
        end if;

        insert into vacas (propriedade_id, numero_identificacao, nome, status_produtivo, status_reprodutivo)
        values (p_propriedade_id, v_numero, nullif(trim(r->>'nome'), ''), v_situacao, 'vazia')
        returning id into v_vaca_id;

        v_parto_id := null;
        if v_data_parto is not null then
          insert into partos (vaca_id, data_parto, ativa) values (v_vaca_id, v_data_parto, true)
          returning id into v_parto_id;

          -- bezerro desse parto: só se a planilha informar
          if coalesce(trim(r->>'bezerro_numero'), '') <> '' or coalesce(trim(r->>'bezerro_sexo'), '') <> '' then
            v_sexo := lower(coalesce(r->>'bezerro_sexo', ''));
            if v_sexo not in ('macho', 'femea', 'natimorto') then
              raise exception 'sexo do bezerro "%" inválido — use macho, fêmea ou natimorto', coalesce(r->>'bezerro_sexo', '');
            end if;
            v_bez_numero := _import_int(r->>'bezerro_numero', 'Número do bezerro');
            if v_bez_numero is null then
              select coalesce(greatest(
                (select max(numero_identificacao) from vacas where propriedade_id = p_propriedade_id),
                (select max(numero_identificacao) from bezerros where propriedade_id = p_propriedade_id)
              ), 0) + 1 into v_bez_numero;
            elsif exists (select 1 from vacas where propriedade_id = p_propriedade_id and numero_identificacao = v_bez_numero)
               or exists (select 1 from bezerros where propriedade_id = p_propriedade_id and numero_identificacao = v_bez_numero) then
              raise exception 'já existe um animal com o número % (bezerro)', v_bez_numero;
            end if;
            insert into bezerros (propriedade_id, parto_id, mae_id, numero_identificacao, sexo, data_nascimento)
            values (p_propriedade_id, v_parto_id, v_vaca_id, v_bez_numero, v_sexo, v_data_parto);
          end if;
        end if;

        v_data_cob := _import_data(r->>'data_cobertura', 'Data da cobertura');
        v_diag := lower(nullif(trim(coalesce(r->>'diagnostico', '')), ''));
        if v_diag is not null and v_diag not in ('positivo', 'negativo', 'pendente') then
          raise exception 'diagnóstico "%" inválido — use prenhe, vazia ou pendente', r->>'diagnostico';
        end if;
        if v_data_cob is null and v_diag = 'positivo' then
          raise exception 'vaca prenhe precisa da data da cobertura (pra calcular o parto previsto)';
        end if;
        if v_data_cob is not null then
          if v_data_parto is not null and v_data_cob < v_data_parto then
            raise exception 'a cobertura (%) é anterior ao parto atual (%) — informe a cobertura depois do parto',
              to_char(v_data_cob, 'DD/MM/YYYY'), to_char(v_data_parto, 'DD/MM/YYYY');
          end if;
          insert into coberturas (vaca_id, data_cobertura, touro_semen, diagnostico_prenhez)
          values (v_vaca_id, v_data_cob, nullif(trim(r->>'touro'), ''), coalesce(v_diag, 'pendente'));
        end if;

        v_ok_vacas := v_ok_vacas + 1;
      exception when others then
        v_erros := v_erros || jsonb_build_object('aba', 'Vacas', 'linha', v_linha, 'mensagem', sqlerrm);
        v_falhas := v_falhas || v_linha;
      end;
    end loop;

    -- ---------------- mãe das vacas importadas ----------------
    for r in select * from jsonb_array_elements(coalesce(p_dados->'vacas', '[]'::jsonb)) loop
      v_linha := (r->>'linha')::integer;
      continue when v_linha = any(v_falhas) or coalesce(trim(r->>'numero_mae'), '') = '';
      begin
        v_numero := _import_int(r->>'numero', 'Número');
        if _import_int(r->>'numero_mae', 'Número da mãe') = v_numero then
          raise exception 'a vaca % não pode ser mãe dela mesma', v_numero;
        end if;
        select id into v_mae_id from vacas
        where propriedade_id = p_propriedade_id and numero_identificacao = _import_int(r->>'numero_mae', 'Número da mãe');
        if v_mae_id is null then
          raise exception 'mãe % não encontrada na fazenda nem na planilha', r->>'numero_mae';
        end if;
        update vacas set mae_id = v_mae_id
        where propriedade_id = p_propriedade_id and numero_identificacao = v_numero;
      exception when others then
        v_erros := v_erros || jsonb_build_object('aba', 'Vacas', 'linha', v_linha, 'mensagem', sqlerrm);
        v_ok_vacas := v_ok_vacas - 1;
      end;
    end loop;

    -- ---------------- bezerros ----------------
    for r in select * from jsonb_array_elements(coalesce(p_dados->'bezerros', '[]'::jsonb)) loop
      v_linha := (r->>'linha')::integer;
      begin
        if r->>'erro' is not null then raise exception '%', r->>'erro'; end if;
        v_numero := _import_int(r->>'numero', 'Número');
        if v_numero is null then raise exception 'falta o número do bezerro'; end if;
        if exists (select 1 from vacas where propriedade_id = p_propriedade_id and numero_identificacao = v_numero)
           or exists (select 1 from bezerros where propriedade_id = p_propriedade_id and numero_identificacao = v_numero) then
          raise exception 'já existe um animal com o número %', v_numero;
        end if;
        v_sexo := lower(coalesce(r->>'sexo', ''));
        if v_sexo not in ('macho', 'femea', 'natimorto') then
          raise exception 'sexo "%" inválido — use macho, fêmea ou natimorto', coalesce(r->>'sexo', '');
        end if;
        v_data := _import_data(r->>'data_nascimento', 'Data de nascimento');
        if v_data is null then raise exception 'falta a data de nascimento'; end if;
        v_mae_id := null;
        if coalesce(trim(r->>'numero_mae'), '') <> '' then
          select id into v_mae_id from vacas
          where propriedade_id = p_propriedade_id and numero_identificacao = _import_int(r->>'numero_mae', 'Número da mãe');
          if v_mae_id is null then
            raise exception 'mãe % não encontrada', r->>'numero_mae';
          end if;
        end if;
        insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
        values (p_propriedade_id, v_mae_id, v_numero, v_sexo, v_data);
        v_ok_bezerros := v_ok_bezerros + 1;
      exception when others then
        v_erros := v_erros || jsonb_build_object('aba', 'Bezerros', 'linha', v_linha, 'mensagem', sqlerrm);
      end;
    end loop;

    -- ---------------- pesagens de leite (lactação atual) ----------------
    for r in select * from jsonb_array_elements(coalesce(p_dados->'leite', '[]'::jsonb)) loop
      v_linha := (r->>'linha')::integer;
      begin
        if r->>'erro' is not null then raise exception '%', r->>'erro'; end if;
        v_numero := _import_int(r->>'numero_vaca', 'Número da vaca');
        if v_numero is null then raise exception 'falta o número da vaca'; end if;
        select v.id, p.id, p.data_parto into v_vaca_id, v_parto_id, v_data_parto
        from vacas v left join partos p on p.vaca_id = v.id and p.ativa
        where v.propriedade_id = p_propriedade_id and v.numero_identificacao = v_numero
        order by p.data_parto desc nulls last limit 1;
        if v_vaca_id is null then raise exception 'vaca % não encontrada', v_numero; end if;
        if v_parto_id is null then raise exception 'a vaca % não tem parto registrado — leite só da lactação atual', v_numero; end if;

        v_data := _import_data(r->>'data', 'Data');
        if v_data is null then raise exception 'falta a data da pesagem'; end if;
        if v_data < v_data_parto then
          raise exception 'pesagem de % é anterior ao parto atual da vaca % (%) — só importamos a lactação atual',
            to_char(v_data, 'DD/MM/YYYY'), v_numero, to_char(v_data_parto, 'DD/MM/YYYY');
        end if;

        begin
          v_litros := nullif(trim(r->>'litros'), '')::numeric;
        exception when others then
          raise exception 'litros "%" não é um número', r->>'litros';
        end;
        if v_litros is null or v_litros <= 0 or v_litros > 100 then
          raise exception 'litros inválidos (%) — entre 0 e 100', coalesce(r->>'litros', 'vazio');
        end if;

        v_periodo := nullif(lower(trim(coalesce(r->>'ordenha', ''))), '');
        if v_periodo is not null and v_periodo not in ('manha', 'tarde', 'dia_inteiro') then
          raise exception 'ordenha "%" inválida — use manhã, tarde ou dia inteiro', r->>'ordenha';
        end if;
        if exists (
          select 1 from controle_leite where vaca_id = v_vaca_id and data_controle = v_data
            and periodo is not distinct from v_periodo
        ) then
          raise exception 'pesagem repetida: vaca % em % (%)', v_numero, to_char(v_data, 'DD/MM/YYYY'),
            coalesce(_rotulo_periodo(v_periodo), 'sem ordenha');
        end if;

        insert into controle_leite (vaca_id, parto_id, litros, data_controle, periodo)
        values (v_vaca_id, v_parto_id, v_litros, v_data, v_periodo);
        v_ok_leite := v_ok_leite + 1;
      exception when others then
        v_erros := v_erros || jsonb_build_object('aba', 'Leite', 'linha', v_linha, 'mensagem', sqlerrm);
      end;
    end loop;

    if p_modo = 'validar' or (p_modo = 'importar' and jsonb_array_length(v_erros) > 0) then
      raise exception using errcode = 'P0099', message = 'desfazer importação';
    end if;
  exception when sqlstate 'P0099' then
    v_desfeito := true;
  end;

  return jsonb_build_object(
    'ok', jsonb_array_length(v_erros) = 0,
    'importado', not v_desfeito,
    'erros', v_erros,
    'contagem', jsonb_build_object('vacas', v_ok_vacas, 'bezerros', v_ok_bezerros, 'leite', v_ok_leite)
  );
end;
$$;

revoke execute on function importar_rebanho(uuid, jsonb, text) from public, anon;
grant execute on function importar_rebanho(uuid, jsonb, text) to authenticated;
