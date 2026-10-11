import { getPropriedadeAtual } from "@/lib/propriedade";
import { getControleLeiteCache, getVacasCache, getPartosCache } from "@/lib/cached-data";
import { SemPropriedade } from "../../sem-propriedade";
import { PesagemClient, type VacaPesagem, type RegistroPesagem } from "./pesagem-client";

export default async function PesagemPage() {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return <SemPropriedade />;

  const [registrosData, vacasData, partosData] = await Promise.all([
    getControleLeiteCache(propriedadeAtual.id),
    getVacasCache(propriedadeAtual.id),
    getPartosCache(propriedadeAtual.id),
  ]);

  const partoAtivo = new Map(
    (partosData as unknown as { vaca_id: string; ativa: boolean; data_parto: string }[])
      .filter((p) => p.ativa)
      .map((p) => [p.vaca_id, p.data_parto]),
  );

  // Só vaca com parto ativo pode receber leite (regra 2 do CLAUDE.md).
  const vacas: VacaPesagem[] = (vacasData as unknown as { id: string; numero_identificacao: number }[])
    .filter((v) => partoAtivo.has(v.id))
    .map((v) => ({ id: v.id, numero: v.numero_identificacao, dataParto: partoAtivo.get(v.id)! }))
    .sort((a, b) => a.numero - b.numero);

  const registros: RegistroPesagem[] = (
    registrosData as unknown as { vaca_id: string; data_controle: string; periodo: string | null; litros: number }[]
  ).map((r) => ({ vacaId: r.vaca_id, data: r.data_controle, periodo: r.periodo, litros: Number(r.litros) }));

  return (
    <div className="flex flex-1 flex-col p-4 sm:p-6">
      <PesagemClient vacas={vacas} registros={registros} />
    </div>
  );
}
