"use client";

import { useCallback, useEffect, useState } from "react";

export function useSuccessToast(duracaoMs = 2500) {
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    if (!mensagem) return;
    const timer = setTimeout(() => setMensagem(null), duracaoMs);
    return () => clearTimeout(timer);
  }, [mensagem, duracaoMs]);

  const mostrarToast = useCallback((msg: string) => setMensagem(msg), []);

  return { mensagemToast: mensagem, mostrarToast };
}

export function SuccessToast({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center px-4">
      <p className="rounded-full border border-black/[.08] bg-surface px-4 py-2 text-sm font-medium text-brand-green shadow-lg dark:border-white/[.145]">
        {mensagem}
      </p>
    </div>
  );
}
