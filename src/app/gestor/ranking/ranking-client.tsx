"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarRanking } from "../bar-ranking";
import { TrendChart } from "../trend-chart";

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);

const formatarMoedaFracao = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(valor);

const formatarLitros = (litros: number) =>
  `${litros.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L`;

export type FazendaRanking = {
  id: string;
  nome: string;
  producaoDia: number | null;
  custoPorLitro: number | null;
  historicoLitros: number[];
  historicoSaldo: number[];
};

function SemDados() {
  return (
    <p className="text-sm text-zinc-600 dark:text-zinc-400">
      Nenhuma fazenda com dados suficientes ainda.
    </p>
  );
}

const media = (valores: number[]) =>
  valores.length ? valores.reduce((soma, v) => soma + v, 0) / valores.length : 0;

export function RankingClient({
  meses,
  fazendas,
  mediaHistoricoLitros,
  mediaHistoricoSaldo,
}: {
  meses: string[];
  fazendas: FazendaRanking[];
  mediaHistoricoLitros: number[];
  mediaHistoricoSaldo: number[];
}) {
  const [fazendaSelecionadaId, setFazendaSelecionadaId] = useState(fazendas[0]?.id ?? "");

  // Fazenda sem produção/custo calculável (sem pesagem ou sem despesa no período) fica fora do
  // ranking e da média, em vez de entrar como zero e aparecer como "a mais eficiente".
  const comProducao = useMemo(() => fazendas.filter((f) => f.producaoDia !== null), [fazendas]);
  const comCusto = useMemo(() => fazendas.filter((f) => f.custoPorLitro !== null), [fazendas]);

  const rankingLitros = useMemo(
    () =>
      [...comProducao]
        .sort((a, b) => b.producaoDia! - a.producaoDia!)
        .slice(0, 10)
        .map((f) => ({
          id: f.id,
          label: f.nome,
          valor: f.producaoDia!,
          formatado: `${formatarLitros(f.producaoDia!)}/dia`,
        })),
    [comProducao],
  );

  const rankingCustoPorLitro = useMemo(
    () =>
      [...comCusto]
        .sort((a, b) => a.custoPorLitro! - b.custoPorLitro!)
        .slice(0, 10)
        .map((f) => ({
          id: f.id,
          label: f.nome,
          valor: f.custoPorLitro!,
          formatado: `${formatarMoedaFracao(f.custoPorLitro!)}/L`,
        })),
    [comCusto],
  );

  const mediaLitrosPeriodo = media(comProducao.map((f) => f.producaoDia!));
  const mediaCustoPorLitro = media(comCusto.map((f) => f.custoPorLitro!));

  const fazendaSelecionada = fazendas.find((f) => f.id === fazendaSelecionadaId) ?? null;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-zinc-50">
          Fazendas &amp; Ranking
        </h1>
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-ranking" aria-hidden="true" />
          Top 10: Produção de leite
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Litros por dia do rebanho, pela média das pesagens dos últimos 30 dias.
        </p>
        {rankingLitros.length === 0 && <SemDados />}
        <BarRanking
          itens={rankingLitros}
          corClass="bg-ranking"
          fundoClass="bg-ranking-tint"
          showRank
          media={{ label: "Média das fazendas", valor: mediaLitrosPeriodo, formatado: `${formatarLitros(mediaLitrosPeriodo)}/dia` }}
        />
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-financeiro" aria-hidden="true" />
          Top 10: Custo por litro
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Do menor (mais eficiente) pro maior. Despesa média mensal dos últimos 12 meses ÷ produção.
        </p>
        {rankingCustoPorLitro.length === 0 && <SemDados />}
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
          Comparar fazenda com a média (últimos 6 meses fechados)
        </p>

        <div className="flex snap-x justify-center gap-2 overflow-x-auto pb-4">
          {fazendas.map((f) => (
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

        {fazendaSelecionada && (
          <div className="flex flex-col items-center gap-8 pt-5">
            <Link
              href={`/gestor/fazendas/${fazendaSelecionada.id}`}
              className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              Abrir {fazendaSelecionada.nome} →
            </Link>
            <div className="flex w-full flex-col items-center gap-3">
              <p className="text-center text-lg font-semibold text-black dark:text-zinc-50">
                Litros lançados por mês
              </p>
              <TrendChart
                meses={meses}
                serieFazenda={fazendaSelecionada.historicoLitros}
                serieMedia={mediaHistoricoLitros}
                labelFazenda={fazendaSelecionada.nome}
                labelMedia="Média das fazendas com lançamento"
                strokeClass="stroke-leite"
                formatar={formatarLitros}
              />
            </div>

            <div className="w-full border-t border-black/[.08] dark:border-white/[.145]" />

            <div className="flex w-full flex-col items-center gap-3">
              <p className="text-center text-lg font-semibold text-black dark:text-zinc-50">Saldo por mês</p>
              <TrendChart
                meses={meses}
                serieFazenda={fazendaSelecionada.historicoSaldo}
                serieMedia={mediaHistoricoSaldo}
                labelFazenda={fazendaSelecionada.nome}
                labelMedia="Média das fazendas com lançamento"
                strokeClass="stroke-financeiro"
                formatar={formatarMoeda}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
