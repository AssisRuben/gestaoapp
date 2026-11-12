"use client";

import { useTransition } from "react";
import { alternarVerAcompanhamento } from "./plano-actions";

// Botão do cabeçalho do gestor: só aparece se existe alguma fazenda de acompanhamento.
export function FiltroPlano({ ver, quantas }: { ver: boolean; quantas: number }) {
  const [pendente, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => alternarVerAcompanhamento())}
      disabled={pendente}
      title={ver ? "Esconder as fazendas de acompanhamento dos painéis" : "Incluir as fazendas de acompanhamento nos painéis"}
      className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
        ver
          ? "border-brand-green bg-brand-green/10 text-black dark:text-zinc-50"
          : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      }`}
    >
      {ver ? `Acompanhamento: incluídas (${quantas})` : `Acompanhamento: ocultas (${quantas})`}
    </button>
  );
}
