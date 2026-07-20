"use client";

import { useState, type CSSProperties } from "react";

const W = 300;
const H = 190;
const PAD_LEFT = 54;
const PAD_RIGHT = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 18;

// Arredonda o domínio do eixo Y pra números "redondos" (1/2/2.5/5/10 × potência de 10), o mesmo
// truque que libs de gráfico fazem — evita eixo tipo "0, 3741, 7482" e dá uma folga em cima/embaixo
// da linha em vez de esticar exatamente do mínimo ao máximo dos dados.
function calcularTicks(min: number, max: number, alvo = 4) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const bruto = (max - min) / alvo;
  const exp = Math.floor(Math.log10(bruto));
  const fracao = bruto / 10 ** exp;
  let passo;
  if (fracao <= 1) passo = 1;
  else if (fracao <= 2) passo = 2;
  else if (fracao <= 2.5) passo = 2.5;
  else if (fracao <= 5) passo = 5;
  else passo = 10;
  passo *= 10 ** exp;

  const minNice = Math.floor(min / passo) * passo;
  const maxNice = Math.ceil(max / passo) * passo;
  const ticks: number[] = [];
  for (let v = minNice; v <= maxNice + passo * 0.001; v += passo) {
    ticks.push(Math.round((v + Number.EPSILON) * 1000) / 1000);
  }
  return ticks;
}

export function TrendChart({
  meses,
  serieFazenda,
  serieMedia,
  labelFazenda,
  labelMedia,
  strokeClass,
  formatar,
}: {
  meses: string[];
  serieFazenda: number[];
  serieMedia: number[];
  labelFazenda: string;
  labelMedia: string;
  strokeClass: string;
  formatar: (v: number) => string;
}) {
  const [selecionado, setSelecionado] = useState<number | null>(null);

  const todosValores = [...serieFazenda, ...serieMedia];
  const ticks = calcularTicks(Math.min(...todosValores, 0), Math.max(...todosValores, 0));
  const ticksMin = ticks[0];
  const ticksMax = ticks[ticks.length - 1];
  const range = ticksMax - ticksMin || 1;

  const areaW = W - PAD_LEFT - PAD_RIGHT;
  const areaH = H - PAD_TOP - PAD_BOTTOM;
  const escalaY = (v: number) => PAD_TOP + areaH - ((v - ticksMin) / range) * areaH;
  const stepX = areaW / Math.max(meses.length - 1, 1);

  const pontosFazenda = serieFazenda.map((v, i) => ({ x: PAD_LEFT + i * stepX, y: escalaY(v) }));
  const pontosMedia = serieMedia.map((v, i) => ({ x: PAD_LEFT + i * stepX, y: escalaY(v) }));

  const pontoSelecionado = selecionado !== null ? pontosFazenda[selecionado] : null;

  function clicarPonto(i: number) {
    setSelecionado((atual) => (atual === i ? null : i));
  }

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="relative w-full">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" preserveAspectRatio="none">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD_LEFT}
                x2={W - PAD_RIGHT}
                y1={escalaY(t)}
                y2={escalaY(t)}
                strokeWidth={1}
                className="stroke-black/[.06] dark:stroke-white/[.1]"
              />
              <text
                x={PAD_LEFT - 6}
                y={escalaY(t)}
                textAnchor="end"
                dominantBaseline="middle"
                fontSize={8.5}
                className="fill-zinc-500 dark:fill-zinc-400"
              >
                {formatar(t)}
              </text>
            </g>
          ))}

          <polyline
            points={pontosMedia.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            strokeWidth={2}
            strokeDasharray="4 3"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-zinc-400 dark:stroke-zinc-500"
          />
          <polyline
            points={pontosFazenda.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={strokeClass}
          />
          {pontosFazenda.map((p, i) => (
            <g key={i}>
              <text
                x={p.x}
                y={H - 5}
                textAnchor="middle"
                fontSize={8.5}
                className="fill-zinc-500 dark:fill-zinc-400"
              >
                {meses[i]}
              </text>
              <circle cx={p.x} cy={p.y} r={2.5} className={strokeClass.replace("stroke-", "fill-")} />
              <circle
                cx={p.x}
                cy={p.y}
                r={8}
                fill="transparent"
                stroke={selecionado === i ? "currentColor" : "none"}
                strokeWidth={1.5}
                className={`cursor-pointer ${selecionado === i ? strokeClass : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`Ver valores de ${meses[i]}`}
                onClick={() => clicarPonto(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") clicarPonto(i);
                }}
              />
            </g>
          ))}
        </svg>

        {pontoSelecionado && selecionado !== null && (() => {
          const fracX = pontoSelecionado.x / W;
          // Perto da borda esquerda/direita, centralizar o popup no ponto (translateX(-50%)) faria
          // ele vazar pra fora do card — nessas zonas ele ancora pelo próprio lado esquerdo/direito
          // (com uma margem fixa) e cresce pra dentro, em vez de ficar centralizado no ponto.
          const zona = fracX < 0.25 ? "esquerda" : fracX > 0.75 ? "direita" : "centro";
          const style: CSSProperties = {
            top: `${(pontoSelecionado.y / H) * 100}%`,
            transform: zona === "centro" ? "translate(-50%, calc(-100% - 10px))" : "translateY(calc(-100% - 10px))",
          };
          if (zona === "esquerda") style.left = 4;
          else if (zona === "direita") style.right = 4;
          else style.left = `${fracX * 100}%`;

          return (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-black/[.08] bg-surface px-3 py-2 shadow-lg dark:border-white/[.145]"
            style={style}
          >
            <p className="text-base font-semibold text-black dark:text-zinc-50">{meses[selecionado]}</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {labelFazenda}:{" "}
              <span className="font-mono tabular-nums font-semibold text-black dark:text-zinc-50">
                {formatar(serieFazenda[selecionado])}
              </span>
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {labelMedia}:{" "}
              <span className="font-mono tabular-nums font-semibold text-black dark:text-zinc-50">
                {formatar(serieMedia[selecionado])}
              </span>
            </p>
          </div>
          );
        })()}
      </div>

      <div className="flex items-center justify-center gap-4 text-sm text-black dark:text-zinc-50">
        <span className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${strokeClass.replace("stroke-", "bg-")}`} aria-hidden="true" />
          {labelFazenda}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-500" aria-hidden="true" />
          {labelMedia}
        </span>
      </div>

      {selecionado === null && (
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-400">
          Clique em um ponto do gráfico pra ver os valores do mês.
        </p>
      )}
    </div>
  );
}
