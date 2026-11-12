-- Importação do rebanho sem número do brinco (12/11/2026).
--
-- Fazenda que só conhece as vacas pelo nome: a planilha agora aceita
--   - vaca SEM número (com nome): recebe o próximo número livre da fazenda, que nunca bate com um
--     número escrito em outra linha da planilha (as linhas com número entram primeiro). A resposta
--     traz 'numerados' (aba, linha, nome, número) pra pessoa anotar/marcar os animais;
--   - bezerro SEM número: idem;
--   - mãe (vacas e bezerros) e vaca do leite por NÚMERO ou por NOME (número tem prioridade; nome
--     sem acento/maiúscula/espaço extra).
-- Nome repetido na mesma fazenda é recusado na importação (a vaca do leite/da mãe por nome ficaria
-- ambígua). Nome que já serve pra mais de uma vaca (dado antigo) pede o número.
-- O resto é igual à 0045.

create or replace function _nome_chave(p_nome text) returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      lower(translate(trim(coalesce(p_nome, '')),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
      '\s+', ' ', 'g'),
    '');
$$;

-- vaca da fazenda por número (só dígitos) ou por nome; null se não achar; erro se o nome é ambíguo
create or replace function _resolver_vaca(p_propriedade_id uuid, p_ref text) returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  v_ref text := trim(coalesce(p_ref, ''));
  v_id uuid;
  v_qtd integer;
begin
  if v_ref = '' then return null; end if;
  if v_ref ~ '^\d{1,9}$' then
    select id into v_id from vacas where propriedade_id = p_propriedade_id and numero_identificacao = v_ref::integer;
    return v_id;
  end if;
  select count(*), (array_agg(id))[1] into v_qtd, v_id
  from vacas where propriedade_id = p_propriedade_id and _nome_chave(nome) = _nome_chave(v_ref);
  if v_qtd > 1 then
    raise exception 'o nome "%" serve para mais de uma vaca da fazenda — use o número', v_ref;
  end if;
  return v_id;
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
  v_proximo integer;
  v_nome text;
  v_ref text;
  v_mapa jsonb := '{}';
  v_numerados jsonb := '[]';
  v_auto boolean;
begin
  if not exists (
    select 1 from usuarios_propriedades where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;
  if p_modo not in ('validar', 'importar', 'importar_ok') then
    raise exception 'modo de importação inválido';
  end if;

  select greatest(
    coalesce((
      select max(x::integer) from (
        select trim(e->>'numero') as x from jsonb_array_elements(coalesce(p_dados->'vacas', '[]'::jsonb)) e
        union all
        select trim(e->>'bezerro_numero') from jsonb_array_elements(coalesce(p_dados->'vacas', '[]'::jsonb)) e
        union all
        select trim(e->>'numero') from jsonb_array_elements(coalesce(p_dados->'bezerros', '[]'::jsonb)) e
      ) s where x ~ '^\d{1,9}$'
    ), 0),
    coalesce((select max(numero_identificacao) from vacas where propriedade_id = p_propriedade_id), 0),
    coalesce((select max(numero_identificacao) from bezerros where propriedade_id = p_propriedade_id), 0)
  ) into v_proximo;

  begin
    -- ---------------- vacas (sem a mãe; ela pode estar mais abaixo na planilha) ----------------
    for r in
      select t.e from jsonb_array_elements(coalesce(p_dados->'vacas', '[]'::jsonb)) with ordinality as t(e, i)
      order by (nullif(trim(t.e->>'numero'), '') is null), t.i
    loop
      v_linha := (r->>'linha')::integer;
      begin
        if r->>'erro' is not null then raise exception '%', r->>'erro'; end if;

        v_nome := nullif(trim(r->>'nome'), '');
        if v_nome is not null and exists (
          select 1 from vacas where propriedade_id = p_propriedade_id and _nome_chave(nome) = _nome_chave(v_nome)
        ) then
          raise exception 'já existe uma vaca chamada "%" na fazenda (ou mais acima na planilha) — nomes iguais confundem; use outro nome', v_nome;
        end if;
        v_numero := _import_int(r->>'numero', 'Número');
        v_auto := v_numero is null;
        if v_auto then
          if v_nome is null then raise exception 'falta o número ou o nome da vaca'; end if;
          v_proximo := v_proximo + 1;
          v_numero := v_proximo;
        end if;
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
        values (p_propriedade_id, v_numero, v_nome, v_situacao, 'vazia')
        returning id into v_vaca_id;
        v_mapa := v_mapa || jsonb_build_object(v_linha::text, v_vaca_id);

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
              v_proximo := v_proximo + 1;
              v_bez_numero := v_proximo;
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

        if v_auto then
          v_numerados := v_numerados || jsonb_build_object('aba', 'Vacas', 'linha', v_linha, 'nome', v_nome, 'numero', v_numero);
        end if;
        v_ok_vacas := v_ok_vacas + 1;
      exception when others then
        v_erros := v_erros || jsonb_build_object('aba', 'Vacas', 'linha', v_linha, 'mensagem', sqlerrm);
        v_falhas := v_falhas || v_linha;
      end;
    end loop;

    -- ---------------- mãe das vacas importadas (número ou nome) ----------------
    for r in select * from jsonb_array_elements(coalesce(p_dados->'vacas', '[]'::jsonb)) loop
      v_linha := (r->>'linha')::integer;
      continue when v_linha = any(v_falhas) or coalesce(trim(r->>'numero_mae'), '') = '';
      begin
        v_vaca_id := (v_mapa->>v_linha::text)::uuid;
        v_mae_id := _resolver_vaca(p_propriedade_id, r->>'numero_mae');
        if v_mae_id is null then
          raise exception 'mãe "%" não encontrada na fazenda nem na planilha', r->>'numero_mae';
        end if;
        if v_mae_id = v_vaca_id then
          raise exception 'a vaca não pode ser mãe dela mesma';
        end if;
        update vacas set mae_id = v_mae_id where id = v_vaca_id;
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
        v_auto := v_numero is null;
        if v_auto then
          v_proximo := v_proximo + 1;
          v_numero := v_proximo;
        elsif exists (select 1 from vacas where propriedade_id = p_propriedade_id and numero_identificacao = v_numero)
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
          v_mae_id := _resolver_vaca(p_propriedade_id, r->>'numero_mae');
          if v_mae_id is null then
            raise exception 'mãe "%" não encontrada', r->>'numero_mae';
          end if;
        end if;
        insert into bezerros (propriedade_id, mae_id, numero_identificacao, sexo, data_nascimento)
        values (p_propriedade_id, v_mae_id, v_numero, v_sexo, v_data);
        if v_auto then
          v_numerados := v_numerados || jsonb_build_object('aba', 'Bezerros', 'linha', v_linha, 'nome', null, 'numero', v_numero);
        end if;
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
        v_ref := nullif(trim(coalesce(r->>'numero_vaca', '')), '');
        if v_ref is null then raise exception 'falta a vaca (número ou nome)'; end if;
        v_vaca_id := _resolver_vaca(p_propriedade_id, v_ref);
        if v_vaca_id is null then raise exception 'vaca "%" não encontrada', v_ref; end if;
        select p.id, p.data_parto into v_parto_id, v_data_parto
        from partos p where p.vaca_id = v_vaca_id and p.ativa
        order by p.data_parto desc limit 1;
        if v_parto_id is null then raise exception 'a vaca "%" não tem parto registrado — leite só da lactação atual', v_ref; end if;

        v_data := _import_data(r->>'data', 'Data');
        if v_data is null then raise exception 'falta a data da pesagem'; end if;
        if v_data < v_data_parto then
          raise exception 'pesagem de % é anterior ao parto atual da vaca "%" (%) — só importamos a lactação atual',
            to_char(v_data, 'DD/MM/YYYY'), v_ref, to_char(v_data_parto, 'DD/MM/YYYY');
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
          raise exception 'pesagem repetida: vaca "%" em % (%)', v_ref, to_char(v_data, 'DD/MM/YYYY'),
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
    'numerados', v_numerados,
    'contagem', jsonb_build_object('vacas', v_ok_vacas, 'bezerros', v_ok_bezerros, 'leite', v_ok_leite)
  );
end;
$$;

revoke execute on function importar_rebanho(uuid, jsonb, text) from public, anon;
grant execute on function importar_rebanho(uuid, jsonb, text) to authenticated;
