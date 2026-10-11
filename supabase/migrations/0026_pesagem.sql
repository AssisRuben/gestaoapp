-- Pesagem do dia: grava o leite de várias vacas de uma vez (tela Leite → Pesagem do dia).
--
-- Cada item usa a mesma regra de _registrar_leite (0025). Como a tela mostra o que já foi lançado
-- naquela data e ordenha, um item de vaca que já tem lançamento nessa ordenha CORRIGE o valor em
-- vez de ser recusado como repetido. Item sem litros é ignorado (nunca apaga). Erro numa vaca não
-- impede as outras: volta na lista de erros, com o número da vaca.

create or replace function registrar_pesagem(
  p_propriedade_id uuid,
  p_data_controle date,
  p_periodo text,
  p_itens jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_periodo text := _periodo_valido(p_periodo);
  v_item jsonb;
  v_vaca_id uuid;
  v_numero integer;
  v_litros numeric;
  v_existente controle_leite;
  v_salvos integer := 0;
  v_corrigidos integer := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  if v_periodo is null then
    raise exception 'escolha a ordenha (manhã, tarde ou dia inteiro)';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_vaca_id := nullif(v_item->>'vaca_id', '')::uuid;
    v_litros := nullif(v_item->>'litros', '')::numeric;
    continue when v_litros is null;

    select numero_identificacao into v_numero from vacas
    where id = v_vaca_id and propriedade_id = p_propriedade_id;
    if v_numero is null then
      v_erros := v_erros || jsonb_build_object('vaca_id', v_vaca_id, 'numero', null, 'mensagem', 'vaca não encontrada nesta fazenda');
      continue;
    end if;

    begin
      select * into v_existente from controle_leite
      where vaca_id = v_vaca_id and data_controle = p_data_controle and periodo = v_periodo
      limit 1;

      if v_existente.id is not null then
        if v_existente.litros is distinct from v_litros then
          if v_litros <= 0 or v_litros > 100 then
            raise exception 'quantidade de litros inválida (%)', _fmt_num(v_litros);
          end if;
          update controle_leite set litros = v_litros where id = v_existente.id;
          v_corrigidos := v_corrigidos + 1;
        end if;
      else
        perform _registrar_leite(v_vaca_id, v_litros, p_data_controle, v_periodo);
        v_salvos := v_salvos + 1;
      end if;
    exception when others then
      v_erros := v_erros || jsonb_build_object('vaca_id', v_vaca_id, 'numero', v_numero, 'mensagem', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('salvos', v_salvos, 'corrigidos', v_corrigidos, 'erros', v_erros);
end;
$$;

revoke execute on function registrar_pesagem(uuid, date, text, jsonb) from public, anon;
grant execute on function registrar_pesagem(uuid, date, text, jsonb) to authenticated;
