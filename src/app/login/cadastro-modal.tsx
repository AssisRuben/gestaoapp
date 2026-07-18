"use client";

import { useActionState } from "react";
import { cadastrarNovaFazenda } from "./cadastro-actions";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-sm font-medium text-black dark:text-zinc-50";

export function CadastroModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(cadastrarNovaFazenda, undefined);

  if (state?.success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative flex w-full max-w-sm flex-col gap-3 rounded-lg bg-white p-6 text-center dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Cadastro realizado!</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Confira seu e-mail e clique no link de confirmação pra ativar sua conta e poder entrar.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 self-center rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form
        action={action}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Cadastrar fazenda</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Fechar
          </button>
        </div>

        <h3 className="text-base font-semibold text-black dark:text-zinc-50">Dados gerais</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="nome_propriedade" className={LABEL_CLASSES}>
              Nome da propriedade
            </label>
            <input id="nome_propriedade" name="nome_propriedade" type="text" required className={CAMPO_CLASSES} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="nome_produtor" className={LABEL_CLASSES}>
              Nome do produtor
            </label>
            <input id="nome_produtor" name="nome_produtor" type="text" required className={CAMPO_CLASSES} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="municipio" className={LABEL_CLASSES}>
              Município
            </label>
            <input id="municipio" name="municipio" type="text" className={CAMPO_CLASSES} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="estado" className={LABEL_CLASSES}>
              Estado
            </label>
            <input id="estado" name="estado" type="text" className={CAMPO_CLASSES} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="tecnico_responsavel" className={LABEL_CLASSES}>
              Técnico responsável
            </label>
            <input id="tecnico_responsavel" name="tecnico_responsavel" type="text" className={CAMPO_CLASSES} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="whatsapp" className={LABEL_CLASSES}>
              WhatsApp
            </label>
            <input id="whatsapp" name="whatsapp" type="text" className={CAMPO_CLASSES} />
          </div>
        </div>

        <h3 className="text-base font-semibold text-black dark:text-zinc-50">Acesso</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className={LABEL_CLASSES}>
              E-mail
            </label>
            <input id="email" name="email" type="email" required autoComplete="email" className={CAMPO_CLASSES} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className={LABEL_CLASSES}>
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={CAMPO_CLASSES}
            />
          </div>
        </div>

        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onClose}
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
  );
}
