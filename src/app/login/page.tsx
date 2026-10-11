"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { login } from "./actions";
import { CadastroModal } from "./cadastro-modal";
import { GoogleIcon } from "./google-icon";
import { createClient } from "@/lib/supabase/client";
import { LimparOffline } from "../(app)/registrar-offline";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, undefined);
  const [cadastroAberto, setCadastroAberto] = useState(false);

  async function entrarComGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4 dark:bg-black">
      <form
        action={formAction}
        className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-black/[.08] bg-white p-6 sm:p-8 dark:border-white/[.145] dark:bg-zinc-950"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <Image
            src="/gestao-pec-logo.png"
            alt="Gestão Pec"
            width={776}
            height={768}
            sizes="100px"
            className="h-24 w-auto"
            priority
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Entre com sua conta.
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

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-black dark:text-zinc-50">
              Senha
            </label>
            <Link
              href="/esqueci-senha"
              className="text-xs text-zinc-600 hover:text-brand-green hover:underline dark:text-zinc-400"
            >
              Esqueci minha senha
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
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
          {pending ? "Entrando..." : "Entrar"}
        </button>

        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-black/[.08] dark:bg-white/[.145]" />
          <span className="text-xs text-zinc-600 dark:text-zinc-400">ou</span>
          <div className="h-px flex-1 bg-black/[.08] dark:bg-white/[.145]" />
        </div>

        <button
          type="button"
          onClick={entrarComGoogle}
          className="flex items-center justify-center gap-2 rounded-full border border-black/[.08] px-5 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          <GoogleIcon className="h-4 w-4" />
          Entrar com Google
        </button>

        <p className="text-center text-sm text-zinc-600 dark:text-zinc-400">
          Não tem conta?{" "}
          <button
            type="button"
            onClick={() => setCadastroAberto(true)}
            className="font-medium text-brand-green hover:underline"
          >
            Cadastre-se
          </button>
        </p>
      </form>

      {cadastroAberto && <CadastroModal onClose={() => setCadastroAberto(false)} />}
      <LimparOffline />
    </div>
  );
}
