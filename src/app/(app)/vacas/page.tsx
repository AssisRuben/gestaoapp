import { getPropriedadeAtual } from "@/lib/propriedade";
import { getVacasCache } from "@/lib/cached-data";
import { VacasClient } from "./vacas-client";
import type { Vaca } from "./types";

export default async function VacasPage() {
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

  const data = await getVacasCache(propriedadeAtual.id);
  const vacas = data as unknown as Vaca[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <VacasClient vacas={vacas} />
    </div>
  );
}
