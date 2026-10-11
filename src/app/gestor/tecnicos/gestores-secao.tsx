"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adicionarGestor, removerGestor } from "./actions";
import { CAMPO_CLASSES, BOTAO_PRIMARIO, Campo } from "../programa/ui";

export type Gestor = { usuario_id: string; email: string; nome: string | null; desde: string };

function Remover({ gestor, sozinho }: { gestor: Gestor; sozinho: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action, pending] = useActionState(removerGestor, undefined);

  if (sozinho) return null;
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-sm font-medium text-red-600 hover:underline dark:text-red-400">
        Remover
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="usuario_id" value={gestor.usuario_id} />
      <div className="flex items-center gap-2 text-sm">
        <button type="button" onClick={() => setConfirmando(false)} className="text-zinc-600 hover:underline dark:text-zinc-400">
          Cancelar
        </button>
        <button type="submit" disabled={pending} className="rounded-full bg-red-600 px-3 py-1.5 font-medium text-white disabled:opacity-50">
          {pending ? "Removendo..." : "Confirmar"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}

export function GestoresSecao({ gestores, usuarioId }: { gestores: Gestor[]; usuarioId: string | null }) {
  const [state, action, pending] = useActionState(adicionarGestor, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) queueMicrotask(() => formRef.current?.reset());
  }, [state]);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Gestores do programa ({gestores.length})</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Veem todas as fazendas, cuidam do catálogo de touros, das entregas de doses e dos acessos. Quem também tiver
          fazenda própria alterna pelo botão &quot;Minha fazenda&quot;.
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
        {gestores.map((g) => (
          <li key={g.usuario_id} className="flex items-start justify-between gap-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-black dark:text-zinc-50">
                {g.nome ?? g.email}
                {g.usuario_id === usuarioId && <span className="text-zinc-500"> (você)</span>}
              </span>
              {g.nome && <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">{g.email}</span>}
            </div>
            <Remover gestor={g} sozinho={gestores.length <= 1} />
          </li>
        ))}
      </ul>
      <form ref={formRef} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Campo id="gestor_email" label="Adicionar gestor (e-mail da conta)">
          <input id="gestor_email" name="email" type="email" required className={CAMPO_CLASSES} />
        </Campo>
        <button type="submit" disabled={pending} className={`${BOTAO_PRIMARIO} py-3`}>
          {pending ? "Adicionando..." : "Adicionar"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </section>
  );
}
