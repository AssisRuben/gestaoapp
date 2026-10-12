"use client";

import { useMemo, useState } from "react";
import { Meter } from "../(app)/meter";
import { CearaMap } from "./ceara-map";
import { TagIcon, MilkIcon, MoneyIcon, CycleIcon } from "../(app)/nav-icons";
import { hojeBrasil, type LeiteDiario, type FinanceiroDiario } from "@/lib/gestor";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";


const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);

const formatarLitros = (litros: number) =>
  `${litros.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L`;

type Fazenda = {
  id: string;
  nome_propriedade: string;
  latitude: number | null;
  longitude: number | null;
  vacasTotal: number;
  vacasEmLactacao: number;
  totalAnimais: number;
};

export function GestorDashboardClient({
  fazendas,
  registrosLeite,
  lancamentos,
  iepMedio,
}: {
  fazendas: Fazenda[];
  registrosLeite: LeiteDiario[];
  lancamentos: FinanceiroDiario[];
  iepMedio: number | null;
}) {
  const hoje = hojeBrasil();
  const [inicio, setInicio] = useState(`${hoje.slice(0, 7)}-01`);
  const [fim, setFim] = useState(hoje);
  const [fazendaSelecionadaId, setFazendaSelecionadaId] = useState<string | null>(null);

  const selecionar = (id: string) =>
    setFazendaSelecionadaId((atual) => (atual === id ? null : id));

  const registrosFiltrados = useMemo(
    () => registrosLeite.filter((r) => r.data >= inicio && r.data <= fim),
    [registrosLeite, inicio, fim],
  );
  const lancamentosFiltrados = useMemo(
    () => lancamentos.filter((l) => l.data >= inicio && l.data <= fim),
    [lancamentos, inicio, fim],
  );

  const litrosPorFazenda = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const r of registrosFiltrados) {
      mapa.set(r.propriedade_id, (mapa.get(r.propriedade_id) ?? 0) + r.litros);
    }
    return mapa;
  }, [registrosFiltrados]);

  const saldoPorFazenda = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of lancamentosFiltrados) {
      mapa.set(l.propriedade_id, (mapa.get(l.propriedade_id) ?? 0) + l.receita - l.despesa);
    }
    return mapa;
  }, [lancamentosFiltrados]);

  const litrosTotal = useMemo(
    () => [...litrosPorFazenda.values()].reduce((soma, v) => soma + v, 0),
    [litrosPorFazenda],
  );
  const saldoTotal = useMemo(
    () => [...saldoPorFazenda.values()].reduce((soma, v) => soma + v, 0),
    [saldoPorFazenda],
  );

  // Média simples entre fazendas (cada fazenda pesa igual, independente do tamanho do rebanho) —
  // fazendas sem nenhuma vaca/animal ainda ficam fora da média pra não puxar ela artificialmente
  // pra baixo.
  const { pctLactacaoMedia, pctVacasDoTotalMedia } = useMemo(() => {
    const comVacas = fazendas.filter((f) => f.vacasTotal > 0);
    const comAnimais = fazendas.filter((f) => f.totalAnimais > 0);
    const mediaLactacao = comVacas.length
      ? (comVacas.reduce((soma, f) => soma + f.vacasEmLactacao / f.vacasTotal, 0) / comVacas.length) * 100
      : 0;
    const mediaVacasDoTotal = comAnimais.length
      ? (comAnimais.reduce((soma, f) => soma + f.vacasTotal / f.totalAnimais, 0) / comAnimais.length) * 100
      : 0;
    return { pctLactacaoMedia: mediaLactacao, pctVacasDoTotalMedia: mediaVacasDoTotal };
  }, [fazendas]);

  const fazendaSelecionada = fazendas.find((f) => f.id === fazendaSelecionadaId) ?? null;
  const mediaLitrosPorFazenda = fazendas.length ? litrosTotal / fazendas.length : 0;
  const mediaSaldoPorFazenda = fazendas.length ? saldoTotal / fazendas.length : 0;

  const vacasTotalSoma = fazendas.reduce((soma, f) => soma + f.vacasTotal, 0);
  const mediaVacasPorFazenda = fazendas.length ? vacasTotalSoma / fazendas.length : 0;

  // Produção média por vaca/dia (litros/vaca/dia): média das pesagens do período (soma dos litros
  // ÷ vacas pesadas), mesma régua de calcular_indicadores — não depende de toda vaca ser pesada
  // todo dia (controle leiteiro mensal também dá o número certo).
  const pesagensTotal = useMemo(
    () => registrosFiltrados.reduce((soma, r) => soma + r.pesagens, 0),
    [registrosFiltrados],
  );
  const producaoMediaPorVacaDia = pesagensTotal > 0 ? litrosTotal / pesagensTotal : 0;

  const fazendasParaMapa = useMemo(
    () =>
      fazendas.map((f) => ({
        id: f.id,
        nome_propriedade: f.nome_propriedade,
        latitude: f.latitude,
        longitude: f.longitude,
        litrosPeriodo: litrosPorFazenda.get(f.id) ?? 0,
        saldoPeriodo: saldoPorFazenda.get(f.id) ?? 0,
        pctLactacao: f.vacasTotal > 0 ? (f.vacasEmLactacao / f.vacasTotal) * 100 : 0,
      })),
    [fazendas, litrosPorFazenda, saldoPorFazenda],
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-zinc-50">
          Visão geral
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          {fazendas.length} {fazendas.length === 1 ? "fazenda cadastrada" : "fazendas cadastradas"}
        </p>
      </div>

      <div className="flex flex-row items-end gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="gestor_inicio" className={LABEL_CLASSES}>
            De
          </label>
          <input
            id="gestor_inicio"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className={`w-full min-w-0 ${CAMPO_CLASSES}`}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="gestor_fim" className={LABEL_CLASSES}>
            Até
          </label>
          <input
            id="gestor_fim"
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className={`w-full min-w-0 ${CAMPO_CLASSES}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
          <p className="order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl text-black dark:text-zinc-50">
            {fazendas.length}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Fazendas</p>
        </div>
        <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
          <p className="order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl text-black dark:text-zinc-50">
            {formatarLitros(litrosTotal)}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Litros no período (soma)</p>
        </div>
        <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
          <p
            className={`order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl ${saldoTotal >= 0 ? "text-brand-green" : "text-red-600 dark:text-red-400"}`}
          >
            {formatarMoeda(saldoTotal)}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Saldo no período (soma)</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-base font-semibold text-black dark:text-zinc-50">Médias entre fazendas</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
          <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
            <span className="hidden h-10 w-10 items-center justify-center rounded-full sm:flex bg-vacas-tint">
              <TagIcon className="h-5 w-5 text-vacas-ink" />
            </span>
            <p className="order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl text-black dark:text-zinc-50">
              {mediaVacasPorFazenda.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
            </p>
            <p className="text-base text-zinc-600 dark:text-zinc-400">Vacas por fazenda</p>
          </div>
          <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
            <span className="hidden h-10 w-10 items-center justify-center rounded-full sm:flex bg-leite-tint">
              <MilkIcon className="h-5 w-5 text-leite-ink" />
            </span>
            <p className="order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl text-black dark:text-zinc-50">
              {formatarLitros(mediaLitrosPorFazenda)}
            </p>
            <p className="text-base text-zinc-600 dark:text-zinc-400">Litros por fazenda</p>
          </div>
          <div className="flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
            <span className="hidden h-10 w-10 items-center justify-center rounded-full sm:flex bg-financeiro-tint">
              <MoneyIcon className="h-5 w-5 text-financeiro-ink" />
            </span>
            <p
              className={`order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl ${mediaSaldoPorFazenda >= 0 ? "text-brand-green" : "text-red-600 dark:text-red-400"}`}
            >
              {formatarMoeda(mediaSaldoPorFazenda)}
            </p>
            <p className="text-base text-zinc-600 dark:text-zinc-400">Saldo por fazenda</p>
          </div>
          <div className="col-span-3 sm:col-span-1 flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
            <span className="hidden h-10 w-10 items-center justify-center rounded-full sm:flex bg-leite-tint">
              <MilkIcon className="h-5 w-5 text-leite-ink" />
            </span>
            <p className="order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl text-black dark:text-zinc-50">
              {producaoMediaPorVacaDia.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
              <span className="text-base font-semibold"> L</span>
            </p>
            <p className="text-base text-zinc-600 dark:text-zinc-400">Produção por vaca/dia</p>
          </div>
          <div className="col-span-3 sm:col-span-1 flex flex-row items-center justify-between gap-3 rounded-2xl border bg-surface border-black/[.08] px-4 py-3 text-left sm:flex-col sm:justify-center sm:gap-1.5 sm:p-5 sm:text-center dark:border-white/[.145]">
            <span className="hidden h-10 w-10 items-center justify-center rounded-full sm:flex bg-reproducao-tint">
              <CycleIcon className="h-5 w-5 text-reproducao-ink" />
            </span>
            <p className="order-last shrink-0 font-mono text-lg font-bold tabular-nums sm:order-none sm:w-full sm:truncate sm:text-center sm:text-2xl text-black dark:text-zinc-50">
              {iepMedio !== null ? Math.round(iepMedio) : "—"}
              {iepMedio !== null && <span className="text-base font-semibold"> dias</span>}
            </p>
            <p className="text-base text-zinc-600 dark:text-zinc-400">IEP médio</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-vacas" aria-hidden="true" />
          Composição do rebanho (média entre fazendas)
        </p>
        <Meter
          label="Vacas em lactação"
          pct={pctLactacaoMedia}
          corClass="bg-vacas"
          fundoClass="bg-vacas-tint"
        />
        <Meter
          label="Vacas no total de animais"
          pct={pctVacasDoTotalMedia}
          corClass="bg-bezerros"
          fundoClass="bg-bezerros-tint"
        />
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-3 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-financeiro" aria-hidden="true" />
          Fazendas no Ceará
        </p>
        <CearaMap fazendas={fazendasParaMapa} selecionadaId={fazendaSelecionadaId} onSelecionar={selecionar} />
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-3 text-base font-semibold text-black dark:text-zinc-50">
          Comparar fazenda com a média
        </p>

        <div className="flex snap-x gap-2 overflow-x-auto pb-2">
          {fazendas.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => selecionar(f.id)}
              className={`shrink-0 snap-start whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                f.id === fazendaSelecionadaId
                  ? "border-financeiro bg-financeiro-tint text-financeiro-ink"
                  : "border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              }`}
            >
              {f.nome_propriedade}
            </button>
          ))}
          {fazendas.length === 0 && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma fazenda cadastrada.</p>
          )}
        </div>

        {fazendaSelecionada && (
          <table className="mt-3 w-full text-left text-base">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                <th className="py-2 font-medium">Métrica</th>
                <th className="py-2 text-right font-medium">{fazendaSelecionada.nome_propriedade}</th>
                <th className="py-2 text-right font-medium">Média das fazendas</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-black/[.08] dark:border-white/[.145]">
                <td className="py-2 text-black dark:text-zinc-50">Litros no período</td>
                <td className="py-2 text-right font-mono tabular-nums text-black dark:text-zinc-50">
                  {formatarLitros(litrosPorFazenda.get(fazendaSelecionada.id) ?? 0)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatarLitros(mediaLitrosPorFazenda)}
                </td>
              </tr>
              <tr className="border-b border-black/[.08] dark:border-white/[.145]">
                <td className="py-2 text-black dark:text-zinc-50">Saldo no período</td>
                <td className="py-2 text-right font-mono tabular-nums text-black dark:text-zinc-50">
                  {formatarMoeda(saldoPorFazenda.get(fazendaSelecionada.id) ?? 0)}
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatarMoeda(mediaSaldoPorFazenda)}
                </td>
              </tr>
              <tr>
                <td className="py-2 text-black dark:text-zinc-50">% vacas em lactação</td>
                <td className="py-2 text-right font-mono tabular-nums text-black dark:text-zinc-50">
                  {fazendaSelecionada.vacasTotal > 0
                    ? Math.round((fazendaSelecionada.vacasEmLactacao / fazendaSelecionada.vacasTotal) * 100)
                    : 0}
                  %
                </td>
                <td className="py-2 text-right font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  {Math.round(pctLactacaoMedia)}%
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
