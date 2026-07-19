import { getPropriedadeAtual } from "@/lib/propriedade";
import { getFinanceiroCache } from "@/lib/cached-data";
import { FinanceiroClient } from "./financeiro-client";
import type { Lancamento } from "./types";

export default async function FinanceiroPage() {
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

  const data = await getFinanceiroCache(propriedadeAtual.id);
  const lancamentos = data as unknown as Lancamento[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <FinanceiroClient lancamentos={lancamentos} />
    </div>
  );
}
