import { getPropriedadeAtual } from "@/lib/propriedade";
import { SemPropriedade } from "../sem-propriedade";
import { getVacasCache } from "@/lib/cached-data";
import { VacasClient } from "./vacas-client";
import type { Vaca } from "./types";

export default async function VacasPage({
  searchParams,
}: {
  searchParams: Promise<{ editar?: string }>;
}) {
  const { editar } = await searchParams;
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return <SemPropriedade />;
  }

  const data = await getVacasCache(propriedadeAtual.id);
  const vacas = data as unknown as Vaca[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <VacasClient vacas={vacas} editarId={editar} />
    </div>
  );
}
