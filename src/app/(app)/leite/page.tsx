import { getPropriedadeAtual } from "@/lib/propriedade";
import { SemPropriedade } from "../sem-propriedade";
import { getControleLeiteCache, getVacasCache, getPartosCache } from "@/lib/cached-data";
import { LeiteClient } from "./leite-client";
import type { RegistroLeite, VacaOpcao } from "./types";

export default async function LeitePage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return <SemPropriedade />;
  }

  const [registrosData, vacasData, partosData] = await Promise.all([
    getControleLeiteCache(propriedadeAtual.id),
    getVacasCache(propriedadeAtual.id),
    getPartosCache(propriedadeAtual.id),
  ]);

  const registros = registrosData as unknown as RegistroLeite[];
  const todasVacas = vacasData as unknown as { id: string; numero_identificacao: number }[];
  const partos = partosData as unknown as { vaca_id: string; ativa: boolean }[];

  // Só dá pra lançar leite de vaca com parto ativo (regra 2 do CLAUDE.md) — o dropdown já
  // vem filtrado pra evitar erro de constraint no banco. Filtra pelo parto ativo de verdade,
  // não por vacas.status_produtivo: esse campo é só um espelho e pode ficar dessincronizado
  // (ex.: dado de teste com status "lactacao" mas sem nenhum parto ativo criado de fato).
  const vacaIdsComLactacaoAtiva = new Set(partos.filter((p) => p.ativa).map((p) => p.vaca_id));
  const vacas: VacaOpcao[] = todasVacas
    .filter((v) => vacaIdsComLactacaoAtiva.has(v.id))
    .map((v) => ({ id: v.id, numero_identificacao: v.numero_identificacao }));

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <LeiteClient registros={registros} vacas={vacas} />
    </div>
  );
}
