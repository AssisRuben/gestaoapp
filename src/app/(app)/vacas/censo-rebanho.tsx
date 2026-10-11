"use client";

import type { Vaca } from "./types";

// Censo do rebanho (o tipo_relatorio=cadastro do bot): vacas por status produtivo × reprodutivo.
// Valor fora do vocabulário (ou nulo, gravado pelo bot) cai em "outro" pra conta fechar com o total.

export type FiltroCenso = { produtivo?: string; reprodutivo?: string };

const PRODUTIVO: [string, string][] = [
  ["lactacao", "Lactação"],
  ["seca", "Seca"],
  ["novilha", "Novilha"],
];
const REPRODUTIVO: [string, string][] = [
  ["prenhe", "Prenhe"],
  ["vazia_em_servico", "Em serviço"],
  ["vazia", "Vazia"],
];
const OUTRO: [string, string] = ["outro", "Outro"];

export function chaveProdutivo(v: Vaca) {
  return PRODUTIVO.some(([k]) => k === v.status_produtivo) ? v.status_produtivo : OUTRO[0];
}
export function chaveReprodutivo(v: Vaca) {
  return REPRODUTIVO.some(([k]) => k === v.status_reprodutivo) ? v.status_reprodutivo : OUTRO[0];
}

export function rotuloFiltro(filtro: FiltroCenso) {
  const rotulo = (lista: [string, string][], chave?: string) =>
    [...lista, OUTRO].find(([k]) => k === chave)?.[1];
  return [rotulo(PRODUTIVO, filtro.produtivo), rotulo(REPRODUTIVO, filtro.reprodutivo)]
    .filter(Boolean)
    .join(" · ");
}

export function CensoRebanho({
  vacas,
  filtro,
  onFiltrar,
}: {
  vacas: Vaca[];
  filtro: FiltroCenso;
  onFiltrar: (filtro: FiltroCenso) => void;
}) {
  const contagem = new Map<string, number>();
  for (const v of vacas) {
    const chave = `${chaveProdutivo(v)}|${chaveReprodutivo(v)}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }
  const n = (p?: string, r?: string) =>
    [...contagem].reduce((soma, [chave, qtd]) => {
      const [cp, cr] = chave.split("|");
      return (p === undefined || cp === p) && (r === undefined || cr === r) ? soma + qtd : soma;
    }, 0);

  const linhas = n(OUTRO[0]) > 0 ? [...PRODUTIVO, OUTRO] : PRODUTIVO;
  const colunas = n(undefined, OUTRO[0]) > 0 ? [...REPRODUTIVO, OUTRO] : REPRODUTIVO;
  const total = vacas.length;

  function celula(p: string | undefined, r: string | undefined, forte = false) {
    const qtd = n(p, r);
    const ativo =
      (p !== undefined || r !== undefined) && filtro.produtivo === p && filtro.reprodutivo === r;
    return (
      <td key={`${p}|${r}`} className="p-0 text-center">
        <button
          type="button"
          disabled={qtd === 0}
          onClick={() => onFiltrar(ativo ? {} : { produtivo: p, reprodutivo: r })}
          aria-pressed={ativo}
          className={`w-full px-2 py-2 tabular-nums transition-colors enabled:hover:bg-black/[.04] disabled:cursor-default dark:enabled:hover:bg-white/[.06] ${
            ativo ? "bg-vacas-tint text-vacas-ink" : qtd === 0 ? "text-zinc-400 dark:text-zinc-600" : "text-black dark:text-zinc-50"
          } ${forte ? "font-semibold" : ""}`}
        >
          {qtd === 0 ? "–" : qtd}
        </button>
      </td>
    );
  }

  if (total === 0) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-black dark:text-zinc-50">Censo do rebanho</h2>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {total} {total === 1 ? "vaca" : "vacas"} · toque num número pra filtrar
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]">
        <table className="w-full text-sm sm:text-base">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-3 py-2 text-left font-medium">
                <span className="sr-only">Status produtivo</span>
              </th>
              {colunas.map(([k, rotulo]) => (
                <th key={k} className="px-2 py-2 text-center font-medium">
                  {rotulo}
                </th>
              ))}
              <th className="px-2 py-2 text-center font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(([p, rotulo]) => (
              <tr key={p} className="border-b border-black/[.04] dark:border-white/[.06]">
                <th scope="row" className="px-3 py-2 text-left font-medium text-black dark:text-zinc-50">
                  {rotulo}
                </th>
                {colunas.map(([r]) => celula(p, r))}
                {celula(p, undefined, true)}
              </tr>
            ))}
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-semibold text-black dark:text-zinc-50">
                Total
              </th>
              {colunas.map(([r]) => celula(undefined, r, true))}
              {celula(undefined, undefined, true)}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
