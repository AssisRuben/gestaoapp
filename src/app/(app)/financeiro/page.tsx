import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";
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

  const supabase = await createClient();
  const { data } = await supabase
    .from("financeiro")
    .select("*")
    .eq("propriedade_id", propriedadeAtual.id)
    .order("data", { ascending: false });

  const lancamentos = (data ?? []) as Lancamento[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <FinanceiroClient lancamentos={lancamentos} />
    </div>
  );
}
