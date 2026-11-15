-- WhatsApp: vaca pelo nome ("informações da Mimosa", "a Estrela deu 15 litros", "filha da Mimosa").
--
-- A IA põe o nome em entidades.nome_vaca / nome_mae (sem inventar número). O n8n chama esta
-- função antes de rotear a intenção ("Resolver Vaca pelo Nome (RPC)"); ela troca o nome pelo número
-- da vaca DA FAZENDA do telefone e devolve as entidades com numero_vaca / numero_mae preenchidos —
-- daí pra frente o fluxo é o mesmo de quem falou o número.
--
-- Nunca grava por aproximação: nome que não existe ou que serve pra mais de uma vaca volta com
-- ok=false e uma pergunta, e o bot não faz nada. Número falado vale mais que o nome. A comparação
-- ignora acento, maiúscula e espaço extra (_nome_chave, 0057).

create or replace function bot_resolver_vacas(p_telefone text, p_entidades jsonb) returns jsonb
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

revoke execute on function bot_resolver_vacas(text, jsonb) from public, anon, authenticated;
grant execute on function bot_resolver_vacas(text, jsonb) to service_role;
