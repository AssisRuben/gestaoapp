"use client";

import { useActionState, useState } from "react";
import { criarMinhaFazenda } from "./actions";
import { CampoTelefone } from "../campo-telefone";
import { CampoLocalizacao } from "../campo-localizacao";

const CAMPO =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const ROTULO = "text-sm font-medium text-black dark:text-zinc-50";

// Na tela "sem fazenda": o produtor que entrou com Google (ou por outra conta sem fazenda) cadastra
// a fazenda aqui — é o que libera o WhatsApp dele pro bot (0047).
export function CadastrarMinhaFazenda() {
  const [aberto, setAberto] = useState(false);
  const [state, action, pending] = useActionState(criarMinhaFazenda, undefined);

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="w-full rounded-full border border-black/[.08] px-4 py-2.5 text-base font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        Sou produtor: cadastrar minha fazenda
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-black dark:text-zinc-50">Cadastrar minha fazenda</h2>
      <label className="flex flex-col gap-1">
        <span className={ROTULO}>Nome da fazenda</span>
        <input id="mf_nome" name="nome_propriedade" required className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={ROTULO}>Seu nome</span>
        <input id="mf_produtor" name="nome_produtor" required autoComplete="name" className={CAMPO} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={ROTULO}>WhatsApp</span>
        <CampoTelefone id="mf_whatsapp" name="whatsapp" required className={CAMPO} />
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          É desse número que você vai mandar os dados pro bot do Gestão Pec.
        </span>
      </label>
      <div className="grid grid-cols-[1fr_5rem] gap-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className={ROTULO}>Município</span>
          <input id="mf_municipio" name="municipio" className={CAMPO} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={ROTULO}>UF</span>
          <input id="mf_estado" name="estado" maxLength={2} defaultValue="CE" className={`uppercase ${CAMPO}`} />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className={ROTULO}>Localização da fazenda (opcional)</span>
        <CampoLocalizacao />
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="flex-1 rounded-full border border-black/[.08] px-4 py-2.5 text-sm font-medium text-black dark:border-white/[.145] dark:text-zinc-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-brand-green px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
        >
          {pending ? "Cadastrando..." : "Cadastrar fazenda"}
        </button>
      </div>
    </form>
  );
}
