-- WhatsApp: vaca que não está no cadastro (19/11/2026). O produtor mandou "Vaca 1 se chama calçada, ela
-- pariu dia 11/11/25..." pra uma vaca que ainda não existia na fazenda, e o bot respondeu "Vaca não
-- localizada no sistema. Por favor, verifique o número ou nome digitado" — sem dizer que dava pra
-- cadastrar. O técnico teve que lançar pelo site.
--
-- A resposta vinha de nós do n8n ("Buscar Vaca (Parto)" → "If1" → "Code in JavaScript1"), que saem do
-- workflow: o parto vai direto pra bot_registrar_parto, que já confere a vaca. Aqui a recusa "Não
-- encontrei a vaca N no cadastro" de TODAS as funções do bot que passam por _bot_resposta_com_nome
-- (leite, cobertura, parto, diagnóstico, atualizar vaca) ganha o caminho do cadastro — num lugar só,
-- sem copiar cada função (ver o aviso de 0066_bot_nome_nas_respostas).

create or replace function _bot_resposta_com_nome(p_telefone text, p_resposta jsonb) returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_propriedade_id uuid := _propriedade_do_telefone(p_telefone);
  v_resposta jsonb := p_resposta;
  v_campo text;
  v_numero text;
begin
  if v_propriedade_id is null or p_resposta is null then
    return p_resposta;
  end if;

  -- vaca que não está no cadastro: diz como cadastrar
  v_numero := substring(v_resposta->>'mensagem'
    from '^Não encontrei a vaca ([0-9]+) no cadastro\. Confira o número e mande de novo\.$');
  if v_numero is not null then
    v_resposta := v_resposta || jsonb_build_object('mensagem', format(
      'Não encontrei a vaca %s no cadastro. Confira o número. Se ela é nova, cadastre primeiro: mande '
      '"cadastra a vaca %s" (pode dizer o nome dela também). Depois mande o parto e as coberturas, um de cada vez.',
      v_numero, v_numero));
  end if;

  foreach v_campo in array array['mensagem', 'descricao'] loop
    if jsonb_typeof(v_resposta->v_campo) = 'string' then
      v_resposta := v_resposta || jsonb_build_object(v_campo,
        _bot_nome_das_vacas(v_propriedade_id, v_resposta->>v_campo));
    end if;
  end loop;
  return v_resposta;
end;
$$;

revoke execute on function _bot_resposta_com_nome(text, jsonb) from public, anon, authenticated;
