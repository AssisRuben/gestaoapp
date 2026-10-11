import { getPropriedadeAtual, getNomesUsuarios } from "@/lib/propriedade";
import { SemPropriedade } from "../sem-propriedade";
import {
  getCoberturasCache,
  getPartosCache,
  getVacasCache,
  getTourosCache,
  getEntregasDosesCache,
  getSaldoDosesCache,
  getBaixasDosesCache,
} from "@/lib/cached-data";
import { ReproducaoClient } from "./reproducao-client";
import type {
  Cobertura,
  Parto,
  VacaOpcao,
  Touro,
  EntregaDoses,
  SaldoDoses,
  BaixaDoses,
} from "./types";

export default async function ReproducaoPage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return <SemPropriedade />;
  }

  const [coberturasData, partosData, vacasData, tourosData, entregasData, saldosData, baixasData, nomes] =
    await Promise.all([
      getCoberturasCache(propriedadeAtual.id),
      getPartosCache(propriedadeAtual.id),
      getVacasCache(propriedadeAtual.id),
      getTourosCache(),
      getEntregasDosesCache(propriedadeAtual.id),
      getSaldoDosesCache(propriedadeAtual.id),
      getBaixasDosesCache(propriedadeAtual.id),
      getNomesUsuarios(propriedadeAtual.id),
    ]);

  const coberturas = coberturasData as unknown as Cobertura[];
  const partos = partosData as unknown as Parto[];
  const vacas = vacasData as unknown as VacaOpcao[];
  const touros = tourosData as unknown as Touro[];
  const entregas = entregasData as unknown as EntregaDoses[];
  const saldos = saldosData as unknown as SaldoDoses[];
  const baixas = baixasData as unknown as BaixaDoses[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <ReproducaoClient
        coberturas={coberturas}
        partos={partos}
        vacas={vacas}
        touros={touros}
        entregas={entregas}
        saldos={saldos}
        baixas={baixas}
        nomes={nomes}
      />
    </div>
  );
}
