"use client";

// Dados fictícios estáticos só pra desenhar a tela — nenhuma chamada ao Supabase aqui ainda.
// Quando a ligação real for feita, isso vira o mesmo tipo de fetch agregado que já existe em
// ../page.tsx (getPropriedadesTodasCache / getControleLeiteTodasCache / getFinanceiroTodasCache).

import { useMemo, useState } from "react";
import { BarRanking } from "../bar-ranking";
import { TrendChart } from "../trend-chart";

const MESES = ["Fev", "Mar", "Abr", "Mai", "Jun", "Jul"];

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);

const formatarMoedaFracao = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(valor);

const formatarLitros = (litros: number) =>
  `${litros.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L`;

type FazendaFicticia = {
  id: string;
  nome: string;
  litrosPeriodo: number;
  custoPorLitro: number;
  historicoLitros: number[];
  historicoSaldo: number[];
};

const FAZENDAS: FazendaFicticia[] = [
  {
    id: "1",
    nome: "Fazenda Boa Vista",
    litrosPeriodo: 18400,
    custoPorLitro: 1.35,
    historicoLitros: [15200, 16100, 16800, 17300, 17900, 18400],
    historicoSaldo: [6200, 6800, 7100, 7600, 7900, 8300],
  },
  {
    id: "2",
    nome: "Sítio Três Irmãos",
    litrosPeriodo: 15200,
    custoPorLitro: 1.52,
    historicoLitros: [13800, 14000, 14300, 14700, 15000, 15200],
    historicoSaldo: [4100, 3900, 4300, 3600, 3400, 3100],
  },
  {
    id: "3",
    nome: "Fazenda Recanto Verde",
    litrosPeriodo: 14100,
    custoPorLitro: 1.28,
    historicoLitros: [11900, 12400, 13000, 13400, 13800, 14100],
    historicoSaldo: [5300, 5600, 5900, 6100, 6400, 6700],
  },
  {
    id: "4",
    nome: "Fazenda Água Fria",
    litrosPeriodo: 12800,
    custoPorLitro: 1.61,
    historicoLitros: [12600, 12700, 12900, 12750, 12820, 12800],
    historicoSaldo: [8100, 8300, 8200, 6900, 5600, 5100],
  },
  {
    id: "5",
    nome: "Sítio Nova Esperança",
    litrosPeriodo: 11700,
    custoPorLitro: 1.4,
    historicoLitros: [9800, 10200, 10600, 11000, 11400, 11700],
    historicoSaldo: [2900, 3100, 3300, 3500, 3700, 3900],
  },
  {
    id: "6",
    nome: "Fazenda Santa Luzia",
    litrosPeriodo: 10500,
    custoPorLitro: 1.75,
    historicoLitros: [10800, 10700, 10600, 10550, 10520, 10500],
    historicoSaldo: [4200, 4300, 4100, 4000, 3600, 3100],
  },
  {
    id: "7",
    nome: "Fazenda Vale do Sol",
    litrosPeriodo: 9200,
    custoPorLitro: 1.33,
    historicoLitros: [7600, 7900, 8300, 8600, 8900, 9200],
    historicoSaldo: [2400, 2600, 2900, 3100, 3300, 3500],
  },
  {
    id: "8",
    nome: "Fazenda Serra Bonita",
    litrosPeriodo: 7600,
    custoPorLitro: 1.58,
    historicoLitros: [7100, 7200, 7300, 7350, 7400, 7600],
    historicoSaldo: [3900, 3800, 3600, 3300, 2900, 2500],
  },
];

export default function GestorRankingPage() {
  const [fazendaSelecionadaId, setFazendaSelecionadaId] = useState(FAZENDAS[0].id);

  const rankingLitros = useMemo(
    () =>
      [...FAZENDAS]
        .sort((a, b) => b.litrosPeriodo - a.litrosPeriodo)
        .slice(0, 10)
        .map((f) => ({
          id: f.id,
          label: f.nome,
          valor: f.litrosPeriodo,
          formatado: formatarLitros(f.litrosPeriodo),
        })),
    [],
  );

  const rankingCustoPorLitro = useMemo(
    () =>
      [...FAZENDAS]
        .sort((a, b) => a.custoPorLitro - b.custoPorLitro)
        .map((f) => ({
          id: f.id,
          label: f.nome,
          valor: f.custoPorLitro,
          formatado: `${formatarMoedaFracao(f.custoPorLitro)}/L`,
        })),
    [],
  );

  const mediaLitrosPeriodo = useMemo(
    () => FAZENDAS.reduce((soma, f) => soma + f.litrosPeriodo, 0) / FAZENDAS.length,
    [],
  );
  const mediaCustoPorLitro = useMemo(
    () => FAZENDAS.reduce((soma, f) => soma + f.custoPorLitro, 0) / FAZENDAS.length,
    [],
  );

  const mediaHistoricoLitros = useMemo(
    () => MESES.map((_, i) => FAZENDAS.reduce((soma, f) => soma + f.historicoLitros[i], 0) / FAZENDAS.length),
    [],
  );
  const mediaHistoricoSaldo = useMemo(
    () => MESES.map((_, i) => FAZENDAS.reduce((soma, f) => soma + f.historicoSaldo[i], 0) / FAZENDAS.length),
    [],
  );

  const fazendaSelecionada = FAZENDAS.find((f) => f.id === fazendaSelecionadaId)!;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-zinc-50">
          Fazendas &amp; Ranking
        </h1>
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-3 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-ranking" aria-hidden="true" />
          Top 10: Produção de leite
        </p>
        <BarRanking
          itens={rankingLitros}
          corClass="bg-ranking"
          fundoClass="bg-ranking-tint"
          showRank
          media={{ label: "Média das fazendas", valor: mediaLitrosPeriodo, formatado: formatarLitros(mediaLitrosPeriodo) }}
        />
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-financeiro" aria-hidden="true" />
          Top 10: Custo por litro
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Do menor (mais eficiente) pro maior.</p>
        <BarRanking
          itens={rankingCustoPorLitro}
          corClass="bg-financeiro"
          fundoClass="bg-financeiro-tint"
          showRank
          media={{
            label: "Média das fazendas",
            valor: mediaCustoPorLitro,
            formatado: `${formatarMoedaFracao(mediaCustoPorLitro)}/L`,
          }}
        />
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-3 text-base font-semibold text-black dark:text-zinc-50">
          Comparar fazenda com a média (evolução em 6 meses)
        </p>

        <div className="flex snap-x justify-center gap-2 overflow-x-auto pb-4">
          {FAZENDAS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFazendaSelecionadaId(f.id)}
              className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                f.id === fazendaSelecionadaId
                  ? "border-ranking bg-ranking-tint text-ranking-ink"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              }`}
            >
              {f.nome}
            </button>
          ))}
        </div>

        <div className="border-t border-black/[.08] dark:border-white/[.145]" />

        <div className="flex flex-col items-center gap-8 pt-5">
          <div className="flex w-full flex-col items-center gap-3">
            <p className="text-center text-lg font-semibold text-black dark:text-zinc-50">Litros por mês</p>
            <TrendChart
              meses={MESES}
              serieFazenda={fazendaSelecionada.historicoLitros}
              serieMedia={mediaHistoricoLitros}
              labelFazenda={fazendaSelecionada.nome}
              labelMedia="Média das fazendas"
              strokeClass="stroke-leite"
              formatar={formatarLitros}
            />
          </div>

          <div className="w-full border-t border-black/[.08] dark:border-white/[.145]" />

          <div className="flex w-full flex-col items-center gap-3">
            <p className="text-center text-lg font-semibold text-black dark:text-zinc-50">Saldo por mês</p>
            <TrendChart
              meses={MESES}
              serieFazenda={fazendaSelecionada.historicoSaldo}
              serieMedia={mediaHistoricoSaldo}
              labelFazenda={fazendaSelecionada.nome}
              labelMedia="Média das fazendas"
              strokeClass="stroke-financeiro"
              formatar={formatarMoeda}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
