import { getPropriedadeAtual } from "@/lib/propriedade";
import { getCoberturasCache, getPartosCache, getVacasCache } from "@/lib/cached-data";
import { ReproducaoClient } from "./reproducao-client";
import type { Cobertura, Parto, VacaOpcao } from "./types";

export default async function ReproducaoPage() {
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

  const [coberturasData, partosData, vacasData] = await Promise.all([
    getCoberturasCache(propriedadeAtual.id),
    getPartosCache(propriedadeAtual.id),
    getVacasCache(propriedadeAtual.id),
  ]);

  const coberturas = coberturasData as unknown as Cobertura[];
  const partos = partosData as unknown as Parto[];
  const vacas = vacasData as unknown as VacaOpcao[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <ReproducaoClient coberturas={coberturas} partos={partos} vacas={vacas} />
    </div>
  );
}
