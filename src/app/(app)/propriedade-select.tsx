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

  // O nome da fazenda atual já é o título do cabeçalho: o seletor mostra só "Trocar de fazenda"
  // (antes repetia o nome logo embaixo). A atual continua marcada na lista que abre.
  return (
    <form action={trocarPropriedade}>
      <input type="hidden" name="voltar" value={secao} />
      <select
        name="propriedade_id"
        value=""
        onChange={(e) => {
          if (e.currentTarget.value && e.currentTarget.value !== atualId) e.currentTarget.form?.requestSubmit();
        }}
        aria-label="Trocar de fazenda"
        className="cursor-pointer appearance-none bg-transparent pr-1 text-sm font-medium text-brand-green underline-offset-2 hover:underline"
      >
        <option value="" disabled hidden>
          Trocar de fazenda ▾
        </option>
        {vinculos.map(({ propriedade }) => (
          <option key={propriedade.id} value={propriedade.id}>
            {propriedade.id === atualId ? `${propriedade.nome_propriedade} (atual)` : propriedade.nome_propriedade}
          </option>
        ))}
      </select>
    </form>
  );
}
