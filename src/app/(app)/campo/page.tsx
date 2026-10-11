import { getPropriedadeAtual } from "@/lib/propriedade";
import { getVacasCache, getTourosCache, getSaldoDosesCache } from "@/lib/cached-data";
import type { Touro, SaldoDoses } from "@/lib/programa";
import { SemPropriedade } from "../sem-propriedade";
import { CampoClient, type VacaCampo } from "./campo-client";

// Lançar no campo: cobertura, parto e diagnóstico, funcionando sem internet (public/sw.js guarda
// esta tela; os lançamentos vão pela fila do celular, src/lib/fila-campo.ts).
export default async function CampoPage() {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return <SemPropriedade />;

  const [vacasData, tourosData, saldosData] = await Promise.all([
    getVacasCache(propriedadeAtual.id),
    getTourosCache(),
    getSaldoDosesCache(propriedadeAtual.id),
  ]);

  const vacas: VacaCampo[] = (
    vacasData as unknown as { id: string; numero_identificacao: number; status_produtivo: string; status_reprodutivo: string }[]
  )
    .map((v) => ({ id: v.id, numero: v.numero_identificacao, produtivo: v.status_produtivo, reprodutivo: v.status_reprodutivo }))
    .sort((a, b) => a.numero - b.numero);

  const saldo = new Map((saldosData as unknown as SaldoDoses[]).map((s) => [s.touro_id, Number(s.saldo)]));
  const touros = (tourosData as unknown as Touro[])
    .filter((t) => t.ativo || (saldo.get(t.id) ?? 0) > 0)
    .map((t) => ({ id: t.id, nome: t.nome, codigo: t.codigo, saldo: saldo.get(t.id) ?? 0 }));

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <CampoClient propriedadeId={propriedadeAtual.id} vacas={vacas} touros={touros} />
    </div>
  );
}
