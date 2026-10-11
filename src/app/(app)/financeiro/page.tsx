import { getPropriedadeAtual, getNomesUsuarios } from "@/lib/propriedade";
import { SemPropriedade } from "../sem-propriedade";
import { getFinanceiroCache } from "@/lib/cached-data";
import { FinanceiroClient } from "./financeiro-client";
import type { Lancamento } from "./types";

export default async function FinanceiroPage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return <SemPropriedade />;
  }

  const [data, nomes] = await Promise.all([
    getFinanceiroCache(propriedadeAtual.id),
    getNomesUsuarios(propriedadeAtual.id),
  ]);
  const lancamentos = data as unknown as Lancamento[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <FinanceiroClient lancamentos={lancamentos} nomes={nomes} />
    </div>
  );
}
