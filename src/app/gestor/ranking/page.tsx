import {
  getResumoFazendasCache,
  getLeiteDiarioTodasCache,
  getFinanceiroDiarioTodasCache,
  getIndicadoresTodasCache,
} from "@/lib/cached-data";
import { normalizarResumo, normalizarLeite, normalizarFinanceiro, hojeBrasil } from "@/lib/gestor";
import { createServiceClient } from "@/lib/supabase/service";
import { somarDias } from "@/lib/datas";
import { RankingClient, type FazendaRanking } from "./ranking-client";

const NOMES_MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Últimos N meses FECHADOS ("YYYY-MM"): o mês corrente ficaria sempre lá embaixo no gráfico,
// parecendo queda, só por estar pela metade.
function ultimosMesesFechados(hoje: string, quantidade: number) {
  let ano = Number(hoje.slice(0, 4));
  let mes = Number(hoje.slice(5, 7));
  const meses: string[] = [];
  for (let i = 0; i < quantidade; i++) {
    mes -= 1;
    if (mes === 0) {
      mes = 12;
      ano -= 1;
    }
    meses.unshift(`${ano}-${String(mes).padStart(2, "0")}`);
  }
  return meses;
}

// Média de cada mês só entre as fazendas que lançaram algo naquele mês — fazenda que não usa o
// sistema não puxa a média pra baixo.
function mediaPorMes(series: Map<string, number>[], meses: string[]) {
  return meses.map((mes) => {
    const valores = series.filter((s) => s.has(mes)).map((s) => s.get(mes)!);
    return valores.length ? valores.reduce((soma, v) => soma + v, 0) / valores.length : 0;
  });
}

function somarPorMes<T extends { propriedade_id: string; data: string }>(
  linhas: T[],
  valor: (linha: T) => number,
) {
  const porFazenda = new Map<string, Map<string, number>>();
  for (const linha of linhas) {
    const mes = linha.data.slice(0, 7);
    const serie = porFazenda.get(linha.propriedade_id) ?? new Map<string, number>();
    serie.set(mes, (serie.get(mes) ?? 0) + valor(linha));
    porFazenda.set(linha.propriedade_id, serie);
  }
  return porFazenda;
}

const numeroOuNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Período escolhido (?de=&ate=): indicadores_periodo (0041). Sem período (ou inválido): a régua
// padrão da linha de base — 30 dias de leite e 12 meses de despesa.
async function indicadoresDoPeriodo(de: string, ate: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("indicadores_periodo", { p_inicio: de, p_fim: ate });
  if (error) throw new Error(error.message);
  return (data ?? []) as Record<string, unknown>[];
}

// Dados reais (0020_gestor_dados_reais.sql). O layout do gestor já validou isGestor().
export default async function GestorRankingPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const { de, ate } = await searchParams;
  const periodo = de && ate && DATA_ISO.test(de) && DATA_ISO.test(ate) && de <= ate ? { de, ate } : null;

  const [resumoData, leiteData, financeiroData, indicadoresData] = await Promise.all([
    getResumoFazendasCache(),
    getLeiteDiarioTodasCache(),
    getFinanceiroDiarioTodasCache(),
    periodo ? indicadoresDoPeriodo(periodo.de, periodo.ate) : getIndicadoresTodasCache(),
  ]);

  const meses = ultimosMesesFechados(hojeBrasil(), 6);
  const indicadores = new Map(
    (indicadoresData as Record<string, unknown>[]).map((i) => [i.propriedade_id as string, i]),
  );
  const litrosPorFazenda = somarPorMes(normalizarLeite(leiteData), (l) => l.litros);
  const saldoPorFazenda = somarPorMes(normalizarFinanceiro(financeiroData), (f) => f.receita - f.despesa);

  const fazendas: FazendaRanking[] = normalizarResumo(resumoData)
    .map((r) => {
      const ind = indicadores.get(r.propriedade_id);
      const litros = litrosPorFazenda.get(r.propriedade_id);
      const saldo = saldoPorFazenda.get(r.propriedade_id);
      return {
        id: r.propriedade_id,
        nome: r.nome_propriedade,
        producaoDia: numeroOuNull(ind?.producao_dia),
        custoPorLitro: numeroOuNull(ind?.custo_litro),
        historicoLitros: meses.map((m) => litros?.get(m) ?? 0),
        historicoSaldo: meses.map((m) => saldo?.get(m) ?? 0),
      };
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <RankingClient
      periodo={periodo}
      hoje={hojeBrasil()}
      inicioPadrao={somarDias(hojeBrasil(), -29)}
      meses={meses.map((m) => `${NOMES_MESES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`)}
      fazendas={fazendas}
      mediaHistoricoLitros={mediaPorMes([...litrosPorFazenda.values()], meses)}
      mediaHistoricoSaldo={mediaPorMes([...saldoPorFazenda.values()], meses)}
    />
  );
}
