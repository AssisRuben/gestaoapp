"use client";

import { useActionState, useEffect } from "react";
import { confirmarRecebimentoKit } from "./actions";
import { BotijaoNitrogenio } from "./botijao-nitrogenio";
import { formatarDataBR } from "../format";
import { DIAS_ALERTA_BOTIJAO } from "@/lib/programa";
import type { KitComigo } from "./types";

// Kit de inseminação com quem recebeu (0074): cessão de uso da entidade. Quem recebe vê que o kit e
// o botijão ficam sob a responsabilidade dele, confirma o recebimento uma vez (o kit e as doses que
// vieram nele) e registra o abastecimento do botijão do kit.
export function KitInseminacao({
  kit,
  nomeFazenda,
  nomes,
  onSucesso,
}: {
  kit: KitComigo;
  nomeFazenda: string;
  nomes: Record<string, string>;
  onSucesso: (mensagem: string) => void;
}) {
  const [state, action, pending] = useActionState(confirmarRecebimentoKit, undefined);

  useEffect(() => {
    if (state?.success) queueMicrotask(() => onSucesso("Recebimento do kit confirmado — as doses entraram no saldo."));
  }, [state, onSucesso]);

  const responsavel = kit.com_tecnico ? "de você" : `da ${nomeFazenda || "fazenda"}`;
  const totalDoses = kit.doses.reduce((t, d) => t + d.quantidade, 0);
  const atrasado = kit.dias_sem_abastecer > DIAS_ALERTA_BOTIJAO;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Kit de inseminação <span className="font-mono text-base tabular-nums">{kit.patrimonio}</span>
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Cessão de uso da {kit.entidade_nome} desde {formatarDataBR(kit.cedido_em)}
          {kit.com_tecnico ? " — está com você, em qualquer fazenda que atender" : ""}. O kit e o botijão de nitrogênio
          ficam sob a responsabilidade {responsavel}, inclusive registrar cada abastecimento do botijão.
        </p>
        {kit.entidade_responsavel && (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Na entidade: {kit.entidade_responsavel}
            {kit.entidade_telefone ? ` · ${kit.entidade_telefone}` : ""}
          </p>
        )}
      </div>

      {kit.recebido_em ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Recebimento confirmado em {formatarDataBR(kit.recebido_em.slice(0, 10))}
          {kit.recebido_por_nome ? ` por ${kit.recebido_por_nome}` : ""}.
        </p>
      ) : (
        <form
          action={action}
          className="flex flex-col gap-2 rounded-xl border border-brand-green/30 bg-brand-green/5 p-3"
        >
          <input type="hidden" name="kit_id" value={kit.id} />
          <p className="text-base font-medium text-black dark:text-zinc-50">Confirme que recebeu o kit</p>
          {kit.doses.length > 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Vieram com ele {totalDoses} doses: {kit.doses.map((d) => `${d.touro} ${d.quantidade}`).join(", ")}. A
              confirmação vale pra todas.
            </p>
          )}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ao confirmar, {kit.com_tecnico ? "você declara" : "a fazenda declara"} que recebeu o kit
            {kit.doses.length > 0 ? " e as doses" : ""} e fica responsável por ele e pelo botijão.
          </p>
          {state?.error && <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
          <button
            type="submit"
            disabled={pending}
            className="self-start rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-60"
          >
            {pending ? "Confirmando..." : "Confirmar recebimento do kit"}
          </button>
        </form>
      )}

      {atrasado && (
        <p className="rounded-xl bg-alerta-tint px-3 py-2 text-sm text-alerta-ink">
          {kit.ultimo_abastecimento
            ? `Sem abastecimento há ${kit.dias_sem_abastecer} dias.`
            : `Nenhum abastecimento registrado desde que o kit chegou (${kit.dias_sem_abastecer} dias).`}{" "}
          Registre o abastecimento do botijão — o gestor do programa acompanha.
        </p>
      )}

      <BotijaoNitrogenio
        embutido
        titulo="Botijão do kit"
        kitId={kit.id}
        semFinanceiro={kit.com_tecnico}
        dataMinima={kit.cedido_em}
        abastecimentos={kit.abastecimentos}
        nomes={nomes}
        onSucesso={onSucesso}
      />
    </section>
  );
}
