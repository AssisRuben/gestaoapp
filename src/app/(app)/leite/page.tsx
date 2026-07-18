import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";
import { LeiteClient } from "./leite-client";
import type { RegistroLeite, VacaOpcao } from "./types";

export default async function LeitePage() {
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

  const [{ data: registrosData }, { data: vacasData }] = await Promise.all([
    supabase
      .from("controle_leite")
      .select("*, vaca:vaca_id!inner(id, numero_identificacao, propriedade_id)")
      .eq("vaca.propriedade_id", propriedadeAtual.id)
      .order("numero_identificacao", { foreignTable: "vaca" })
      .order("data_controle", { ascending: false }),
    supabase
      .from("vacas")
      .select("id, numero_identificacao")
      .eq("propriedade_id", propriedadeAtual.id)
      .order("numero_identificacao"),
  ]);

  const registros = (registrosData ?? []) as unknown as RegistroLeite[];
  const vacas = (vacasData ?? []) as VacaOpcao[];

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <LeiteClient registros={registros} vacas={vacas} />
    </div>
  );
}
