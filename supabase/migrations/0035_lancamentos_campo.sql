-- Lançamentos do campo que funcionam sem internet (tela /campo): cobertura, parto e diagnóstico.
--
-- O celular guarda o lançamento e envia quando o sinal volta — e pode reenviar o MESMO lançamento
-- (a resposta se perdeu no sinal ruim, o envio foi interrompido...). Cobertura e parto não são
-- idempotentes por natureza, então cada lançamento leva um id gerado no celular: o primeiro envio
-- grava em lancamentos_campo junto com o resultado; os seguintes só devolvem o mesmo resultado,
-- sem lançar de novo.
--
-- As regras são as mesmas do site e do bot (_registrar_cobertura / _registrar_parto de 0022, e o
-- diagnóstico na cobertura mais recente, regra 3 do CLAUDE.md). Recusa de regra (vaca sem saldo de
-- dose, número de bezerro repetido...) volta como {ok: false, mensagem}, nunca como erro.

create table if not exists lancamentos_campo (
  id uuid primary key,
  propriedade_id uuid not null references propriedades(id) on delete cascade,
  tipo text not null check (tipo in ('cobertura', 'parto', 'diagnostico')),
  dados jsonb not null,
  resultado jsonb not null,
  enviado_por uuid references auth.users(id) on delete set null,
  recebido_em timestamptz not null default now()
);

alter table lancamentos_campo enable row level security;

create or replace function registrar_lancamento_campo(
  p_id uuid,
  p_propriedade_id uuid,
  p_tipo text,
  p_dados jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ja lancamentos_campo;
  v_vaca vacas;
  v_cobertura coberturas;
  v_parto partos;
  v_bezerro bezerros;
  v_resultado jsonb;
  v_data date;
  v_diag text;
begin
  if not exists (
    select 1 from usuarios_propriedades
    where usuario_id = auth.uid() and propriedade_id = p_propriedade_id
  ) then
    raise exception 'sem acesso a esta propriedade';
  end if;

  -- reenvio do mesmo lançamento: devolve o que já foi feito
  select * into v_ja from lancamentos_campo where id = p_id;
  if v_ja.id is not null then
    return v_ja.resultado || jsonb_build_object('repetido', true);
  end if;

  select * into v_vaca from vacas
  where id = nullif(p_dados->>'vaca_id', '')::uuid and propriedade_id = p_propriedade_id;

  begin
    if v_vaca.id is null then
      v_resultado := jsonb_build_object('ok', false, 'mensagem', 'Vaca não encontrada nesta fazenda.');

    elsif p_tipo = 'cobertura' then
      v_data := (p_dados->>'data')::date;
      if v_data is null or v_data > _hoje_fazenda() then
        raise exception 'data da cobertura inválida';
      end if;
      v_cobertura := _registrar_cobertura(
        v_vaca.id, v_data,
        nullif(trim(coalesce(p_dados->>'touro_texto', '')), ''),
        nullif(p_dados->>'touro_id', '')::uuid,
        coalesce((p_dados->>'dose_programa')::boolean, false));
      v_resultado := jsonb_build_object('ok', true, 'mensagem',
        format('Cobertura da vaca %s em %s registrada%s.', v_vaca.numero_identificacao, _fmt_data(v_data),
          case when v_cobertura.dose_programa then ' (dose do programa)' else '' end));

    elsif p_tipo = 'parto' then
      v_data := (p_dados->>'data')::date;
      if v_data is null or v_data > _hoje_fazenda() then
        raise exception 'data do parto inválida';
      end if;
      v_parto := _registrar_parto(
        v_vaca.id, v_data,
        nullif(p_dados->>'numero_bezerro', '')::integer,
        nullif(p_dados->>'sexo_bezerro', ''));
      select * into v_bezerro from bezerros where parto_id = v_parto.id limit 1;
      v_resultado := jsonb_build_object('ok', true, 'mensagem',
        format('Parto da vaca %s em %s registrado — cria nº %s.', v_vaca.numero_identificacao, _fmt_data(v_data),
          coalesce(v_bezerro.numero_identificacao::text, '?')));

    elsif p_tipo = 'diagnostico' then
      v_diag := p_dados->>'resultado';
      if v_diag not in ('positivo', 'negativo', 'pendente') then
        raise exception 'resultado do diagnóstico inválido';
      end if;
      -- regra 3: só a cobertura mais recente da vaca
      select * into v_cobertura from coberturas
      where vaca_id = v_vaca.id
      order by data_cobertura desc, created_at desc limit 1;
      if v_cobertura.id is null then
        v_resultado := jsonb_build_object('ok', false, 'mensagem',
          format('A vaca %s não tem cobertura registrada.', v_vaca.numero_identificacao));
      else
        update coberturas set diagnostico_prenhez = v_diag where id = v_cobertura.id;
        v_resultado := jsonb_build_object('ok', true, 'mensagem',
          format('Diagnóstico da vaca %s (cobertura de %s): %s.', v_vaca.numero_identificacao,
            _fmt_data(v_cobertura.data_cobertura), v_diag));
      end if;

    else
      v_resultado := jsonb_build_object('ok', false, 'mensagem', 'Tipo de lançamento inválido.');
    end if;
  exception when others then
    v_resultado := jsonb_build_object('ok', false, 'mensagem',
      format('Vaca %s: %s.', coalesce(v_vaca.numero_identificacao::text, '?'), sqlerrm));
  end;

  -- recusa também fica registrada: reenviar devolve a mesma recusa, não tenta de novo às cegas
  insert into lancamentos_campo (id, propriedade_id, tipo, dados, resultado, enviado_por)
  values (p_id, p_propriedade_id, p_tipo, p_dados, v_resultado, auth.uid());

  return v_resultado;
end;
$$;

revoke execute on function registrar_lancamento_campo(uuid, uuid, text, jsonb) from public, anon;
grant execute on function registrar_lancamento_campo(uuid, uuid, text, jsonb) to authenticated;
