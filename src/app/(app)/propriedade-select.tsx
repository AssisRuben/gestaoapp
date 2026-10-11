"use client";

import { usePathname } from "next/navigation";
import { trocarPropriedade } from "./actions";
import type { VinculoPropriedade } from "@/lib/propriedade";

export function PropriedadeSelect({
  vinculos,
  atualId,
}: {
  vinculos: VinculoPropriedade[];
  atualId: string;
}) {
  // volta pra mesma seção na outra fazenda (/vacas/<id> → /vacas: aquela vaca é da fazenda anterior)
  const secao = "/" + (usePathname().split("/")[1] ?? "");

  return (
    <form action={trocarPropriedade}>
      <input type="hidden" name="voltar" value={secao} />
      <select
        name="propriedade_id"
        defaultValue={atualId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        aria-label="Trocar de fazenda"
        className="rounded-md border border-black/[.08] bg-transparent px-2 py-1 text-sm text-black dark:border-white/[.145] dark:text-zinc-50"
      >
        {vinculos.map(({ propriedade }) => (
          <option key={propriedade.id} value={propriedade.id}>
            {propriedade.nome_propriedade}
          </option>
        ))}
      </select>
    </form>
  );
}
