import {
  getResumoFazendasCache,
  getLeiteDiarioTodasCache,
  getFinanceiroDiarioTodasCache,
} from "@/lib/cached-data";
import { normalizarResumo, normalizarLeite, normalizarFinanceiro } from "@/lib/gestor";
import { GestorDashboardClient } from "./gestor-dashboard-client";
import { ExportarPlanilhas } from "./exportar-planilhas";

// Dados reais, agregados no banco (0020_gestor_dados_reais.sql). O layout do gestor já validou
// isGestor() antes de chegar aqui, que é o que autoriza as leituras com service role.
export default async function GestorDashboardPage() {
  const [resumoData, leiteData, financeiroData] = await Promise.all([
    getResumoFazendasCache(),
    getLeiteDiarioTodasCache(),
    getFinanceiroDiarioTodasCache(),
  ]);

  const resumo = normalizarResumo(resumoData);

  const fazendas = resumo
    .map((r) => ({
      id: r.propriedade_id,
      nome_propriedade: r.nome_propriedade,
      latitude: r.latitude,
      longitude: r.longitude,
      vacasTotal: r.vacas_total,
      vacasEmLactacao: r.vacas_lactacao,
      totalAnimais: r.vacas_total + r.bezerros_vivos,
    }))
    .sort((a, b) => a.nome_propriedade.localeCompare(b.nome_propriedade, "pt-BR"));

  // IEP médio ponderado pelo número de partos (cada parto pesa igual), não média de médias.
  const iepSoma = resumo.reduce((soma, r) => soma + (r.iep_soma ?? 0), 0);
  const iepQtd = resumo.reduce((soma, r) => soma + r.iep_qtd, 0);

  return (
    <>
      <GestorDashboardClient
        fazendas={fazendas}
        registrosLeite={normalizarLeite(leiteData)}
        lancamentos={normalizarFinanceiro(financeiroData)}
        iepMedio={iepQtd > 0 ? iepSoma / iepQtd : null}
      />
      <ExportarPlanilhas />
    </>
  );
}
