"use client";

import { useState } from "react";

// Peças de formulário compartilhadas pelas seções da aba Programa do gestor.

export const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
export const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";
export const BOTAO_PRIMARIO =
  "rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50";
export const BOTAO_SECUNDARIO =
  "rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]";

export function Modal({ onFechar, children }: { onFechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onFechar} />
      <div className="relative max-h-full w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-6 dark:bg-zinc-950">
        {children}
      </div>
    </div>
  );
}

export function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={LABEL_CLASSES}>
        {label}
      </label>
      {children}
    </div>
  );
}

// Exclusão em dois cliques (regra 6 do CLAUDE.md: nunca apagar na primeira ação).
export function BotaoExcluir({
  acao,
  excluindo,
}: {
  acao: (formData: FormData) => void;
  excluindo: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
      >
        Excluir
      </button>
    );
  }

  return (
    <button
      type="submit"
      formAction={acao}
      formNoValidate
      disabled={excluindo}
      className="rounded-full bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
    >
      {excluindo ? "Excluindo..." : "Confirmar exclusão"}
    </button>
  );
}
