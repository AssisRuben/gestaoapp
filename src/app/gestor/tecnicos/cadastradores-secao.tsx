"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { adicionarCadastrador, removerCadastrador } from "./actions";
import { CAMPO_CLASSES, BOTAO_PRIMARIO, Campo } from "../programa/ui";

export type Cadastrador = { usuario_id: string; email: string; nome: string | null; desde: string; fazendas: number };

function Remover({ item }: { item: Cadastrador }) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action, pending] = useActionState(removerCadastrador, undefined);

  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="text-sm font-medium text-red-600 hover:underline dark:text-red-400">
        Remover
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="usuario_id" value={item.usuario_id} />
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

export function CadastradoresSecao({ cadastradores }: { cadastradores: Cadastrador[] }) {
  const [state, action, pending] = useActionState(adicionarCadastrador, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) queueMicrotask(() => formRef.current?.reset());
  }, [state]);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Técnicos que cadastram fazendas ({cadastradores.length})
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Fazendas de acompanhamento: o técnico cadastra sem WhatsApp e sem acesso do produtor, e só ele (e você) vê os
          dados. Tirar a autorização não apaga as fazendas já cadastradas; o acesso a cada uma continua em Acessos por
          fazenda. A conta precisa existir antes (Cadastre-se → Sou técnico).
        </p>
      </div>
      {cadastradores.length > 0 && (
        <ul className="flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
          {cadastradores.map((c) => (
            <li key={c.usuario_id} className="flex items-start justify-between gap-3 py-2">
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-black dark:text-zinc-50">{c.nome ?? c.email}</span>
                <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                  {c.nome ? `${c.email} · ` : ""}
                  {c.fazendas} fazenda(s) de acompanhamento
                </span>
              </div>
              <Remover item={c} />
            </li>
          ))}
        </ul>
      )}
      <form ref={formRef} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <Campo id="cadastrador_email" label="Autorizar técnico (e-mail da conta)">
          <input id="cadastrador_email" name="email" type="email" required className={CAMPO_CLASSES} />
        </Campo>
        <button type="submit" disabled={pending} className={`${BOTAO_PRIMARIO} py-3`}>
          {pending ? "Autorizando..." : "Autorizar"}
        </button>
      </form>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </section>
  );
}
