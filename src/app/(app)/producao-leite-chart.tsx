"use client";

import { useMemo, useState } from "react";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-sm font-medium text-black dark:text-zinc-50";

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function diffDias(a: string, b: string) {
  const msPorDia = 24 * 60 * 60 * 1000;
  return Math.round((new Date(`${a}T00:00:00`).getTime() - new Date(`${b}T00:00:00`).getTime()) / msPorDia);
}

function formatarDataCurta(data: string) {
  const [, mes, dia] = data.split("-");
  return `${dia}/${mes}`;
}

function niceCeil(valor: number) {
  if (valor <= 0) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(valor)));
  const normalizado = valor / magnitude;
  const niceNormalizado = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;
  return niceNormalizado * magnitude;
}

const PLOT_LEFT = 44;
const PLOT_RIGHT = 12;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 140;
const LARGURA_TOTAL = 720;
const LARGURA_UTIL = LARGURA_TOTAL - PLOT_LEFT - PLOT_RIGHT;

export function ProducaoLeiteChart({
  registros,
}: {
  registros: { data_controle: string; litros: number }[];
}) {
  const hoje = hojeStr();
  const [inicio, setInicio] = useState(`${hoje.slice(0, 7)}-01`);
  const [fim, setFim] = useState(hoje);

  const pontos = useMemo(() => {
    const somaPorDia = new Map<string, number>();
    for (const r of registros) {
      if (r.data_controle < inicio || r.data_controle > fim) continue;
      somaPorDia.set(r.data_controle, (somaPorDia.get(r.data_controle) ?? 0) + Number(r.litros));
    }
    return [...somaPorDia.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [registros, inicio, fim]);

  const totalDiasRange = Math.max(diffDias(fim, inicio), 1);
  const x = (data: string) => PLOT_LEFT + (diffDias(data, inicio) / totalDiasRange) * LARGURA_UTIL;
  const maxLitrosDia = niceCeil(Math.max(...pontos.map(([, v]) => v), 1));
  const y = (v: number) => PLOT_BOTTOM - (v / maxLitrosDia) * (PLOT_BOTTOM - PLOT_TOP);

  const pathD = pontos
    .map(([data, litros], i) => `${i === 0 ? "M" : "L"}${x(data).toFixed(1)},${y(litros).toFixed(1)}`)
    .join(" ");
  const ultimoPonto = pontos[pontos.length - 1];
  const gridValues = [0, maxLitrosDia / 2, maxLitrosDia];

  return (
    <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="dash_inicio" className={LABEL_CLASSES}>
            De
          </label>
          <input
            id="dash_inicio"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className={CAMPO_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="dash_fim" className={LABEL_CLASSES}>
            Até
          </label>
          <input
            id="dash_fim"
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className={CAMPO_CLASSES}
          />
        </div>
      </div>

      <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">Produção de leite</p>

      {pontos.length === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Nenhum registro nesse período.
        </p>
      ) : (
        <svg viewBox={`0 0 ${LARGURA_TOTAL} 170`} className="h-auto w-full">
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
                x={PLOT_LEFT - 6}
                y={y(v)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-zinc-600 dark:fill-zinc-400"
                fontSize={11}
              >
                {Math.round(v)}
              </text>
            </g>
          ))}

          <path
            d={pathD}
            fill="none"
            className="stroke-brand-green"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {pontos.map(([data, litros]) => (
            <circle key={data} cx={x(data)} cy={y(litros)} r={3} className="fill-brand-green" />
          ))}

          {ultimoPonto && (
            <>
              <circle cx={x(ultimoPonto[0])} cy={y(ultimoPonto[1])} r={6} className="fill-background" />
              <circle cx={x(ultimoPonto[0])} cy={y(ultimoPonto[1])} r={4} className="fill-brand-green" />
              <text
                x={x(ultimoPonto[0]) - 8}
                y={y(ultimoPonto[1]) - 10}
                textAnchor="end"
                className="fill-black dark:fill-zinc-50"
                fontSize={12}
                fontWeight={600}
              >
                {Math.round(ultimoPonto[1])} L
              </text>
            </>
          )}

          <text x={PLOT_LEFT} y={162} textAnchor="start" className="fill-zinc-600 dark:fill-zinc-400" fontSize={11}>
            {formatarDataCurta(inicio)}
          </text>
          <text
            x={LARGURA_TOTAL - PLOT_RIGHT}
            y={162}
            textAnchor="end"
            className="fill-zinc-600 dark:fill-zinc-400"
            fontSize={11}
          >
            {formatarDataCurta(fim)}
          </text>
        </svg>
      )}
    </div>
  );
}
