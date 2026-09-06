"use client";

import { useMemo, useState } from "react";

function formatarDataCurta(data: string) {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

function formatarDataLonga(data: string) {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

function niceCeil(valor: number) {
  if (valor <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(valor)));
  const normalizado = valor / magnitude;
  const niceNormalizado = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;
  return niceNormalizado * magnitude;
}

const PLOT_LEFT = 56;
const PLOT_RIGHT = 16;
const PLOT_TOP = 26;
const PLOT_BOTTOM = 150;
const LARGURA_TOTAL = 720;
const LARGURA_UTIL = LARGURA_TOTAL - PLOT_LEFT - PLOT_RIGHT;

export function ProducaoLeiteChart({
  registros,
}: {
  registros: { data_controle: string; litros: number }[];
}) {
  const pontos = useMemo(() => {
    const somaPorDia = new Map<string, number>();
    for (const r of registros) {
      somaPorDia.set(r.data_controle, (somaPorDia.get(r.data_controle) ?? 0) + Number(r.litros));
    }
    return [...somaPorDia.entries()]
      .filter(([, litros]) => litros > 0)
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [registros]);

  const [pontoSelecionado, setPontoSelecionado] = useState<number | null>(null);

  // Zera a seleção quando os dados mudam (novo período/filtro), sem useEffect: ajustar
  // estado durante o render evita o re-render extra que o effect causaria (ver
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  const [pontosAnteriores, setPontosAnteriores] = useState(pontos);
  if (pontos !== pontosAnteriores) {
    setPontosAnteriores(pontos);
    setPontoSelecionado(null);
  }

  // Espaçamento igual entre pontos (por índice), não por distância real em
  // dias — assim dias sem produção não geram espaço em branco no gráfico.
  const x = (i: number) =>
    pontos.length > 1 ? PLOT_LEFT + (i / (pontos.length - 1)) * LARGURA_UTIL : PLOT_LEFT;
  const maxLitrosDia = niceCeil(Math.max(...pontos.map(([, v]) => v), 1));
  const y = (v: number) => PLOT_BOTTOM - (v / maxLitrosDia) * (PLOT_BOTTOM - PLOT_TOP);

  const pathD = pontos
    .map(([, litros], i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(litros).toFixed(1)}`)
    .join(" ");
  const ultimoIndex = pontos.length - 1;
  const ultimoPonto = pontos[ultimoIndex];
  const gridValues = [0, maxLitrosDia / 2, maxLitrosDia];

  const areaD = pontos.length
    ? `${pathD} L${x(ultimoIndex).toFixed(1)},${PLOT_BOTTOM} L${x(0).toFixed(1)},${PLOT_BOTTOM} Z`
    : "";

  return (
    <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
      <p className="mb-2 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
        <span className="h-2.5 w-2.5 rounded-full bg-leite" aria-hidden="true" />
        Produção de leite
      </p>

      {pontos.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Nenhum registro nesse período.
        </p>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${LARGURA_TOTAL} 190`}
            className="h-auto w-full"
            onClick={() => setPontoSelecionado(null)}
          >
            {gridValues.map((v) => (
              <g key={v}>
                <line
                  x1={PLOT_LEFT}
                  x2={LARGURA_TOTAL - PLOT_RIGHT}
                  y1={y(v)}
                  y2={y(v)}
                  className="stroke-black/[.08] dark:stroke-white/[.145]"
                  strokeWidth={1}
                />
                <text
                  x={PLOT_LEFT - 8}
                  y={y(v)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className="fill-zinc-600 font-mono tabular-nums dark:fill-zinc-400"
                  fontSize={22}
                >
                  {Math.round(v)}
                </text>
              </g>
            ))}

            <path d={areaD} className="fill-leite-tint" />

            <path
              d={pathD}
              fill="none"
              className="stroke-leite"
              strokeWidth={3.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {pontos.map(([data, litros], i) => (
              <circle key={data} cx={x(i)} cy={y(litros)} r={5} className="fill-leite" />
            ))}

            {pontoSelecionado !== null && pontos[pontoSelecionado] && (
              <circle
                cx={x(pontoSelecionado)}
                cy={y(pontos[pontoSelecionado][1])}
                r={9}
                fill="none"
                className="stroke-leite"
                strokeWidth={2.5}
              />
            )}

            {ultimoPonto && (
              <>
                <circle cx={x(ultimoIndex)} cy={y(ultimoPonto[1])} r={9} className="fill-background" />
                <circle cx={x(ultimoIndex)} cy={y(ultimoPonto[1])} r={6} className="fill-leite" />
                <text
                  x={x(ultimoIndex) - 12}
                  y={y(ultimoPonto[1]) - 14}
                  textAnchor="end"
                  className="fill-black font-mono tabular-nums dark:fill-zinc-50"
                  fontSize={28}
                  fontWeight={700}
                >
                  {Math.round(ultimoPonto[1])} L
                </text>
              </>
            )}

            <text
              x={PLOT_LEFT}
              y={181}
              textAnchor="start"
              className="fill-zinc-600 font-mono tabular-nums dark:fill-zinc-400"
              fontSize={22}
            >
              {formatarDataCurta(pontos[0][0])}
            </text>
            <text
              x={LARGURA_TOTAL - PLOT_RIGHT}
              y={181}
              textAnchor="end"
              className="fill-zinc-600 font-mono tabular-nums dark:fill-zinc-400"
              fontSize={22}
            >
              {formatarDataCurta(ultimoPonto[0])}
            </text>

            {pontos.map(([data, litros], i) => (
              <circle
                key={`alvo-${data}`}
                cx={x(i)}
                cy={y(litros)}
                r={14}
                fill="transparent"
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setPontoSelecionado((atual) => (atual === i ? null : i));
                }}
              />
            ))}
          </svg>

          {pontoSelecionado !== null && pontos[pontoSelecionado] && (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-lg border border-black/[.08] bg-surface px-3 py-2 text-center shadow-lg dark:border-white/[.145]"
              style={{
                left: `${(x(pontoSelecionado) / LARGURA_TOTAL) * 100}%`,
                top: `${(y(pontos[pontoSelecionado][1]) / 190) * 100}%`,
              }}
            >
              <p className="font-mono text-base font-bold tabular-nums text-black dark:text-zinc-50">
                {Math.round(pontos[pontoSelecionado][1])} L
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {formatarDataLonga(pontos[pontoSelecionado][0])}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
