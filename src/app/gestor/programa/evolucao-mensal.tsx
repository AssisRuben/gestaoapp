"use client";

import { useEffect, useRef, useState } from "react";

// Inseminações com dose do programa por mês da cobertura, empilhadas pelo resultado (0064). A barra
// inteira é o volume do mês; as partes mostram quantas viraram prenhez, vazia ou ainda aguardam
// diagnóstico. Cores conferidas no validador do dataviz (claro e escuro, daltonismo).

export type MesInseminacoes = { mes: string; prenhezes: number; negativos: number; pendentes: number };

const SERIES = [
  { chave: "prenhezes", rotulo: "Prenhe", cor: "fill-[#6d3fa3] dark:fill-[#9d6fd6]", fundo: "bg-[#6d3fa3] dark:bg-[#9d6fd6]" },
  { chave: "negativos", rotulo: "Vazia", cor: "fill-[#a8741a] dark:fill-[#b58322]", fundo: "bg-[#a8741a] dark:bg-[#b58322]" },
  { chave: "pendentes", rotulo: "Aguardando diagnóstico", cor: "fill-zinc-300 dark:fill-zinc-600", fundo: "bg-zinc-300 dark:bg-zinc-600" },
] as const;

const W = 640;
const H = 220;
const ESQ = 34;
const DIR = 8;
const TOPO = 12;
const BASE = 26;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const rotuloMes = (mes: string, comAno: boolean) => {
  const [a, m] = mes.split("-");
  return comAno ? `${MESES[Number(m) - 1]}/${a.slice(2)}` : MESES[Number(m) - 1];
};

function passoEixo(max: number) {
  if (max <= 4) return 1;
  const bruto = max / 4;
  const exp = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

// retângulo com só os cantos de cima arredondados (a ponta da barra)
function pontaArredondada(x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function EvolucaoMensal({ meses }: { meses: MesInseminacoes[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const rolagem = useRef<HTMLDivElement>(null);
  // no celular abre nos meses mais recentes (o fim da rolagem)
  useEffect(() => {
    if (rolagem.current) rolagem.current.scrollLeft = rolagem.current.scrollWidth;
  }, []);
  const total = (m: MesInseminacoes) => m.prenhezes + m.negativos + m.pendentes;
  const max = Math.max(1, ...meses.map(total));
  const passo = passoEixo(max);
  const topoEixo = Math.ceil(max / passo) * passo;
  const ticks = Array.from({ length: topoEixo / passo + 1 }, (_, i) => i * passo);

  const areaW = W - ESQ - DIR;
  const areaH = H - TOPO - BASE;
  const slot = areaW / meses.length;
  const larg = Math.min(28, slot * 0.6);
  const y = (v: number) => TOPO + areaH - (v / topoEixo) * areaH;

  const m = ativo !== null ? meses[ativo] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        {SERIES.map((s) => (
          <span key={s.chave} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${s.fundo}`} />
            {s.rotulo}
          </span>
        ))}
      </div>

      {/* no celular o gráfico rola de lado em vez de encolher os números */}
      <div ref={rolagem} className="overflow-x-auto">
        <div className="relative" style={{ minWidth: 520 }}>
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Inseminações com dose do programa por mês, pelo resultado">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={ESQ} x2={W - DIR} y1={y(t)} y2={y(t)} strokeWidth={1} className="stroke-black/[.06] dark:stroke-white/[.1]" />
                <text x={ESQ - 6} y={y(t) + 4} textAnchor="end" fontSize={11} className="fill-zinc-500 dark:fill-zinc-400">
                  {t}
                </text>
              </g>
            ))}
            {meses.map((mes, i) => {
              const x = ESQ + slot * i + (slot - larg) / 2;
              let acumulado = 0;
              const partes = SERIES.map((s) => ({ s, v: mes[s.chave] })).filter((p) => p.v > 0);
              return (
                <g key={mes.mes} opacity={ativo === null || ativo === i ? 1 : 0.45}>
                  {partes.map(({ s, v }, j) => {
                    const y0 = y(acumulado);
                    acumulado += v;
                    const y1 = y(acumulado);
                    // 2px de folga entre as partes (menos na de baixo, que encosta no eixo)
                    const h = Math.max(1, y0 - y1 - (j > 0 ? 2 : 0));
                    const ultima = j === partes.length - 1;
                    return ultima ? (
                      <path key={s.chave} d={pontaArredondada(x, y1, larg, h, 4)} className={s.cor} />
                    ) : (
                      <rect key={s.chave} x={x} y={y1} width={larg} height={h} className={s.cor} />
                    );
                  })}
                  <text
                    x={ESQ + slot * i + slot / 2}
                    y={H - 8}
                    textAnchor="middle"
                    fontSize={11}
                    className="fill-zinc-500 dark:fill-zinc-400"
                  >
                    {rotuloMes(mes.mes, i === 0 || mes.mes.endsWith("-01-01"))}
                  </text>
                  <rect
                    x={ESQ + slot * i}
                    y={TOPO}
                    width={slot}
                    height={areaH}
                    fill="transparent"
                    onMouseEnter={() => setAtivo(i)}
                    onMouseLeave={() => setAtivo(null)}
                    onClick={() => setAtivo(ativo === i ? null : i)}
                  />
                </g>
              );
            })}
            <line x1={ESQ} x2={W - DIR} y1={y(0)} y2={y(0)} strokeWidth={1} className="stroke-black/[.2] dark:stroke-white/[.25]" />
          </svg>
  
          {m && ativo !== null && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-max -translate-x-1/2 rounded-xl border border-black/[.08] bg-surface px-3 py-2 text-sm shadow-sm dark:border-white/[.145]"
              style={{ left: `${((ESQ + slot * ativo + slot / 2) / W) * 100}%` }}
            >
              <p className="font-semibold text-black dark:text-zinc-50">
                {rotuloMes(m.mes, true)} · {total(m)} {total(m) === 1 ? "inseminação" : "inseminações"}
              </p>
              {SERIES.map((s) => (
                <p key={s.chave} className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                  <span className={`h-2 w-2 rounded-sm ${s.fundo}`} />
                  {s.rotulo}: <span className="font-medium text-black dark:text-zinc-50">{m[s.chave]}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-zinc-600 dark:text-zinc-400">Ver em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-zinc-600 dark:text-zinc-400">
              <tr>
                <th className="py-1 pr-3 font-medium">Mês</th>
                <th className="py-1 pr-3 text-right font-medium">Inseminações</th>
                <th className="py-1 pr-3 text-right font-medium">Prenhe</th>
                <th className="py-1 pr-3 text-right font-medium">Vazia</th>
                <th className="py-1 text-right font-medium">Aguardando</th>
              </tr>
            </thead>
            <tbody className="text-black dark:text-zinc-50">
              {[...meses].reverse().map((mes) => (
                <tr key={mes.mes} className="border-t border-black/[.06] dark:border-white/[.08]">
                  <td className="py-1 pr-3">{rotuloMes(mes.mes, true)}</td>
                  <td className="py-1 pr-3 text-right">{total(mes)}</td>
                  <td className="py-1 pr-3 text-right">{mes.prenhezes}</td>
                  <td className="py-1 pr-3 text-right">{mes.negativos}</td>
                  <td className="py-1 text-right">{mes.pendentes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
