import { getPropriedadeAtual } from "@/lib/propriedade";
import { getControleLeiteCache, getVacasCache } from "@/lib/cached-data";
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

  const [registrosData, vacasData] = await Promise.all([
    getControleLeiteCache(propriedadeAtual.id),
    getVacasCache(propriedadeAtual.id),
  ]);

  const registros = registrosData as unknown as RegistroLeite[];
  const todasVacas = vacasData as unknown as { id: string; numero_identificacao: number; status_produtivo: string }[];
  // Só dá pra lançar leite de vaca em lactação (regra 2 do CLAUDE.md) — o
  // dropdown já vem filtrado pra evitar erro de constraint no banco.
  const vacas: VacaOpcao[] = todasVacas
    .filter((v) => v.status_produtivo === "lactacao")
    .map((v) => ({ id: v.id, numero_identificacao: v.numero_identificacao }));

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <LeiteClient registros={registros} vacas={vacas} />
    </div>
  );
}
