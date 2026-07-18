"use client";

import { useActionState } from "react";
import Link from "next/link";
import { solicitarRedefinicao } from "./actions";

export default function EsqueciSenhaPage() {
  const [state, formAction, pending] = useActionState(solicitarRedefinicao, undefined);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4 dark:bg-black">
      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 sm:p-8 dark:border-white/[.145] dark:bg-zinc-950"
      >
        <div>
          <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
            Esqueci minha senha
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Informe seu e-mail pra receber um link de redefinição.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="email" className="text-sm font-medium text-black dark:text-zinc-50">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>
        )}
        {state?.message && (
          <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-brand-green px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
        >
          {pending ? "Enviando..." : "Enviar link"}
        </button>

        <Link
          href="/login"
          className="text-center text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          Voltar pro login
        </Link>
      </form>
    </div>
  );
}
