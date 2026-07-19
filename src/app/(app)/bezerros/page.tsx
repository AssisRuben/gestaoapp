import { getPropriedadeAtual } from "@/lib/propriedade";
import { getBezerrosCache, getVacasCache } from "@/lib/cached-data";
import { BezerrosClient } from "./bezerros-client";
import type { Bezerro, VacaOpcao } from "./types";

export default async function BezerrosPage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center sm:p-16">
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Sua conta ainda não está vinculada a nenhuma propriedade. Fale com o
          administrador do sistema.
        </p>
      </div>
    );
  }

  const [bezerrosData, vacasData] = await Promise.all([
    getBezerrosCache(propriedadeAtual.id),
    getVacasCache(propriedadeAtual.id),
  ]);

  const bezerros = bezerrosData as unknown as Bezerro[];
  const vacas = vacasData as unknown as VacaOpcao[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <BezerrosClient bezerros={bezerros} vacas={vacas} />
    </div>
  );
}
