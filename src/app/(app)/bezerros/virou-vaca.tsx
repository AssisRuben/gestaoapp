"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { promoverBezerro } from "./actions";
import type { Bezerro } from "./types";

export function idadeTexto(dataNascimento: string | null, hoje: string) {
  if (!dataNascimento) return null;
  const dias = Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${dataNascimento}T12:00:00Z`)) / 86_400_000);
  if (dias < 0) return null;
  if (dias < 60) return `${dias} dias`;
  if (dias < 730) return `${Math.floor(dias / 30.4)} meses`;
  return `${(dias / 365).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`;
}

// Coluna "Virou vaca?": link pra ficha quando já virou; botão pra cadastrar a bezerra como novilha.
// Os cliques não sobem pra linha (que abre a edição do bezerro).
export function VirouVaca({ bezerro, onSucesso }: { bezerro: Bezerro; onSucesso: (msg: string) => void }) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action, pending] = useActionState(promoverBezerro, undefined);

  useEffect(() => {
    if (state?.success) {
      queueMicrotask(() => {
        setConfirmando(false);
        onSucesso(`Bezerra ${bezerro.numero_identificacao ?? ""} cadastrada como vaca!`);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (bezerro.vaca_gerada) {
    return (
      <Link
        href={`/vacas/${bezerro.vaca_gerada.id}`}
        onClick={(e) => e.stopPropagation()}
        className="text-vacas-ink hover:underline"
      >
        Vaca {bezerro.vaca_gerada.numero_identificacao}
      </Link>
    );
  }

  if (bezerro.sexo === "macho" || bezerro.sexo === "natimorto") return <span>—</span>;

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        Virou vaca
      </button>

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 text-left">
          <div className="absolute inset-0 bg-black/30" onClick={() => setConfirmando(false)} />
          <form action={action} className="relative flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 dark:bg-zinc-950">
            <input type="hidden" name="bezerro_id" value={bezerro.id} />
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Cadastrar a bezerra {bezerro.numero_identificacao ?? "sem número"} como vaca?
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Ela passa a aparecer em Vacas como novilha
              {bezerro.numero_identificacao ? `, com o mesmo número (${bezerro.numero_identificacao})` : " (com o próximo número livre)"}
              {bezerro.mae ? ` e filha da vaca ${bezerro.mae.numero_identificacao}` : ""}.
            </p>
            {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
              >
                {pending ? "Cadastrando..." : "Cadastrar"}
              </button>
            </div>
          </form>
        </div>
      )}
    </span>
  );
}
