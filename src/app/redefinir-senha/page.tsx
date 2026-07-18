"use client";

import { useActionState } from "react";
import { redefinirSenha } from "./actions";

export default function RedefinirSenhaPage() {
  const [state, formAction, pending] = useActionState(redefinirSenha, undefined);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4 dark:bg-black">
      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 sm:p-8 dark:border-white/[.145] dark:bg-zinc-950"
      >
        <div>
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            Redefinir senha
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Escolha uma nova senha pra sua conta.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="text-sm font-medium text-black dark:text-zinc-50">
            Nova senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="confirmacao" className="text-sm font-medium text-black dark:text-zinc-50">
            Confirmar nova senha
          </label>
          <input
            id="confirmacao"
            name="confirmacao"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-green px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Salvar nova senha"}
        </button>
      </form>
    </div>
  );
}
