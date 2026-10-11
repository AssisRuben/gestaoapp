import { getPropriedadeAtual } from "@/lib/propriedade";
import { SemPropriedade } from "../sem-propriedade";
import { getBezerrosCache, getVacasCache } from "@/lib/cached-data";
import { BezerrosClient } from "./bezerros-client";
import type { Bezerro, VacaOpcao } from "./types";

export default async function BezerrosPage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return <SemPropriedade />;
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
