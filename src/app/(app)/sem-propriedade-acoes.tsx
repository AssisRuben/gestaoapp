"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Botões da tela "sem fazenda": copiar o e-mail (pra mandar pro produtor/gestor) e atualizar depois
// que liberarem o acesso.
export function CopiarEmail({ email }: { email: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(email);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // sem permissão de área de transferência: o e-mail está visível pra copiar à mão
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="w-full rounded-full border border-black/[.08] px-4 py-2.5 text-base font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
    >
      {copiado ? "E-mail copiado ✓" : "Copiar meu e-mail"}
    </button>
  );
}

export function AtualizarAcesso() {
  const router = useRouter();
  const [atualizando, startAtualizar] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startAtualizar(() => router.refresh())}
      disabled={atualizando}
      className="w-full rounded-full bg-brand-green px-4 py-2.5 text-base font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
    >
      {atualizando ? "Verificando..." : "Já me liberaram — atualizar"}
    </button>
  );
}
