"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { definirLimiteBot } from "./actions";
import { CAMPO_CLASSES, BOTAO_PRIMARIO, Campo } from "../programa/ui";

export type UsoBot = {
  propriedade_id: string;
  nome_propriedade: string;
  limite_proprio: number | null;
  limite: number;
  usadas_hoje: number;
};

// Limite diário do bot (0059). Mostra só as fazendas que usaram o bot hoje ou têm limite próprio;
// o formulário muda o limite de qualquer fazenda.
export function LimiteBotSecao({ usos, padrao }: { usos: UsoBot[]; padrao: number }) {
  const [state, action, pending] = useActionState(definirLimiteBot, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [fazendaId, setFazendaId] = useState("");

  useEffect(() => {
    if (state?.success) {
      queueMicrotask(() => {
        formRef.current?.reset();
        setFazendaId("");
      });
    }
  }, [state]);

  const visiveis = useMemo(
    () =>
      usos
        .filter((u) => u.usadas_hoje > 0 || u.limite_proprio !== null)
        .sort((a, b) => b.usadas_hoje / b.limite - a.usadas_hoje / a.limite),
    [usos],
  );
  const escolhida = usos.find((u) => u.propriedade_id === fazendaId);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Limite do WhatsApp</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Cada fazenda pode mandar até {padrao} mensagens por dia para o bot (mensagens seguidas contam como uma; o SIM/NÃO
          de exclusão não conta). Todos os números da fazenda dividem a mesma cota. Ao passar do limite, o bot avisa uma vez e
          só volta a responder no dia seguinte.
        </p>
      </div>

      {visiveis.length > 0 ? (
        <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
          {visiveis.map((u) => {
            const esgotado = u.usadas_hoje >= u.limite;
            return (
              <li key={u.propriedade_id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-black dark:text-zinc-50">{u.nome_propriedade}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {u.limite_proprio !== null ? `Limite próprio: ${u.limite_proprio}/dia` : `Limite padrão: ${padrao}/dia`}
                  </span>
                </div>
                <span
                  className={`shrink-0 text-sm font-medium ${
                    esgotado ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {u.usadas_hoje}/{u.limite} hoje{esgotado ? " · esgotado" : ""}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma fazenda usou o bot hoje.</p>
      )}

      <form ref={formRef} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <Campo id="limite_fazenda" label="Fazenda">
          <select
            id="limite_fazenda"
            name="propriedade_id"
            required
            value={fazendaId}
            onChange={(e) => setFazendaId(e.target.value)}
            className={CAMPO_CLASSES}
          >
            <option value="">Escolha a fazenda</option>
            {usos.map((u) => (
              <option key={u.propriedade_id} value={u.propriedade_id}>
                {u.nome_propriedade}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="limite_valor" label="Mensagens por dia">
          <input
            key={fazendaId}
            id="limite_valor"
            name="limite"
            type="number"
            inputMode="numeric"
            min={1}
            max={1000}
            step={1}
            placeholder={`${padrao} (padrão)`}
            defaultValue={escolhida?.limite_proprio ?? ""}
            className={CAMPO_CLASSES}
          />
        </Campo>
        <button type="submit" disabled={pending} className={`${BOTAO_PRIMARIO} py-3`}>
          {pending ? "Salvando..." : "Salvar limite"}
        </button>
      </form>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">Deixe vazio para voltar ao padrão de {padrao}.</p>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.success && <p className="text-sm text-green-700 dark:text-green-400">Limite salvo.</p>}
    </section>
  );
}
