"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ProducaoLeiteChart } from "./producao-leite-chart";
import { DespesasPizzaChart } from "./despesas-pizza-chart";
import { confirmarSecagem, confirmarDiagnostico } from "./dashboard-actions";
import { TagIcon, MilkIcon, MoneyIcon } from "./nav-icons";
import { useSuccessToast, SuccessToast } from "./toast";
import { Meter } from "./meter";
import type { Propriedade } from "@/lib/propriedade";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

// Sem centavos aqui de propósito — é o card de resumo compacto do Dashboard,
// e "R$ 2.145,87" estourava a largura do card num celular estreito.
const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);

function ConfirmarSecagemModal({
  vaca,
  onClose,
  onSuccess,
}: {
  vaca: { vacaId: string; numero: number };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState(confirmarSecagem, undefined);

  useEffect(() => {
    if (state?.success) {
      onSuccess();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form
        action={action}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
      >
        <input type="hidden" name="vaca_id" value={vaca.vacaId} />
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Confirmar secagem — vaca {vaca.numero}
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Marca o status produtivo da vaca {vaca.numero} como &quot;Seca&quot;.
        </p>

        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmarDiagnosticoModal({
  cobertura,
  onClose,
  onSuccess,
}: {
  cobertura: { coberturaId: string; numero: number };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [state, action, pending] = useActionState(confirmarDiagnostico, undefined);

  useEffect(() => {
    if (state?.success) {
      onSuccess();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form
        action={action}
        className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
      >
        <input type="hidden" name="cobertura_id" value={cobertura.coberturaId} />
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Diagnóstico de prenhez — vaca {cobertura.numero}
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="diagnostico_prenhez" className={LABEL_CLASSES}>
            Resultado
          </label>
          <select
            id="diagnostico_prenhez"
            name="diagnostico_prenhez"
            required
            defaultValue=""
            className={CAMPO_CLASSES}
          >
            <option value="" disabled>
              Selecione
            </option>
            <option value="positivo">Positivo</option>
            <option value="negativo">Negativo</option>
          </select>
        </div>

        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function DashboardClient({
  propriedadeAtual,
  vacasEmLactacao,
  vacasTotal,
  totalAnimais,
  registrosLeite,
  lancamentos,
  vacasPraSecar,
  diagnosticosPendentes,
}: {
  propriedadeAtual: Propriedade;
  vacasEmLactacao: number;
  vacasTotal: number;
  totalAnimais: number;
  registrosLeite: { litros: number; data_controle: string }[];
  lancamentos: { tipo: string; valor: number; data: string; categoria: string | null }[];
  vacasPraSecar: { vacaId: string; numero: number; secagemPrevista: string }[];
  diagnosticosPendentes: { coberturaId: string; numero: number; data_cobertura: string }[];
}) {
  const hoje = hojeStr();
  const [inicio, setInicio] = useState(`${hoje.slice(0, 7)}-01`);
  const [fim, setFim] = useState(hoje);
  const [vacaParaSecar, setVacaParaSecar] = useState<{ vacaId: string; numero: number } | null>(
    null,
  );
  const [coberturaParaDiagnosticar, setCoberturaParaDiagnosticar] = useState<{
    coberturaId: string;
    numero: number;
  } | null>(null);

  const { mensagemToast, mostrarToast } = useSuccessToast();

  const registrosLeiteFiltrados = useMemo(
    () => registrosLeite.filter((r) => r.data_controle >= inicio && r.data_controle <= fim),
    [registrosLeite, inicio, fim],
  );

  const litrosPeriodo = useMemo(
    () => registrosLeiteFiltrados.reduce((soma, r) => soma + Number(r.litros), 0),
    [registrosLeiteFiltrados],
  );

  const { saldoPeriodo, despesasPorCategoria } = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    const porCategoria: { categoria: string | null; valor: number }[] = [];

    for (const l of lancamentos) {
      if (l.data < inicio || l.data > fim) continue;
      if (l.tipo === "receita") {
        receitas += Number(l.valor);
      } else {
        despesas += Number(l.valor);
        porCategoria.push({ categoria: l.categoria, valor: Number(l.valor) });
      }
    }

    return { saldoPeriodo: receitas - despesas, despesasPorCategoria: porCategoria };
  }, [lancamentos, inicio, fim]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <SuccessToast mensagem={mensagemToast} />

      <div>
        <p className="text-zinc-600 dark:text-zinc-400">
          Produtor: {propriedadeAtual.nome_produtor}
          {propriedadeAtual.municipio && ` · ${propriedadeAtual.municipio}`}
          {propriedadeAtual.estado && `/${propriedadeAtual.estado}`}
        </p>
      </div>

      <div className="flex flex-row items-end gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="dash_inicio" className={LABEL_CLASSES}>
            De
          </label>
          <input
            id="dash_inicio"
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            className={`w-full ${CAMPO_CLASSES}`}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor="dash_fim" className={LABEL_CLASSES}>
            Até
          </label>
          <input
            id="dash_fim"
            type="date"
            value={fim}
            onChange={(e) => setFim(e.target.value)}
            className={`w-full ${CAMPO_CLASSES}`}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/vacas"
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center transition-colors hover:bg-black/[.04] sm:p-5 dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-vacas-tint">
            <TagIcon className="h-5 w-5 text-vacas-ink" />
          </span>
          <p className="w-full truncate text-center font-mono text-xl font-bold tabular-nums sm:text-2xl text-black dark:text-zinc-50">
            {vacasEmLactacao}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Vacas em lactação</p>
        </Link>
        <Link
          href="/leite"
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center transition-colors hover:bg-black/[.04] sm:p-5 dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-leite-tint">
            <MilkIcon className="h-5 w-5 text-leite-ink" />
          </span>
          <p className="w-full truncate text-center font-mono text-xl font-bold tabular-nums sm:text-2xl text-black dark:text-zinc-50">
            {litrosPeriodo.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
            <span className="text-base font-semibold"> L</span>
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Litros no período</p>
        </Link>
        <Link
          href="/financeiro"
          className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center transition-colors hover:bg-black/[.04] sm:p-5 dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-financeiro-tint">
            <MoneyIcon className="h-5 w-5 text-financeiro-ink" />
          </span>
          <p
            className={`w-full truncate text-center font-mono text-xl font-bold tabular-nums sm:text-2xl ${saldoPeriodo >= 0 ? "text-brand-green" : "text-red-600 dark:text-red-400"}`}
          >
            {formatarMoeda(saldoPeriodo)}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Saldo no período</p>
        </Link>
      </div>

      <Link
        href="/reproducao"
        className="flex flex-col gap-4 rounded-2xl border bg-surface border-black/[.08] p-4 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
      >
        <p className="flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-vacas" aria-hidden="true" />
          Composição do rebanho
        </p>
        <Meter
          label="Vacas em lactação"
          pct={vacasTotal > 0 ? (vacasEmLactacao / vacasTotal) * 100 : 0}
          detalhe={`${vacasEmLactacao} de ${vacasTotal}`}
          corClass="bg-vacas"
          fundoClass="bg-vacas-tint"
        />
        <Meter
          label="Vacas no total de animais"
          pct={totalAnimais > 0 ? (vacasTotal / totalAnimais) * 100 : 0}
          detalhe={`${vacasTotal} de ${totalAnimais}`}
          corClass="bg-bezerros"
          fundoClass="bg-bezerros-tint"
        />
      </Link>

      <ProducaoLeiteChart registros={registrosLeiteFiltrados} />

      <DespesasPizzaChart despesas={despesasPorCategoria} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="flex items-center gap-2 text-base font-medium text-black dark:text-zinc-50">
              <span className="h-2 w-2 rounded-full bg-reproducao" aria-hidden="true" />
              Vacas pra secar
            </p>
            <Link href="/reproducao" className="text-sm text-reproducao-ink hover:underline">
              Ver em Reprodução
            </Link>
          </div>
          <table className="w-full text-left text-base">
            <tbody>
              {vacasPraSecar.map((v, i) => (
                <tr
                  key={v.vacaId}
                  className={`border-t border-black/[.08] dark:border-white/[.145] ${
                    i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-black dark:text-zinc-50">Vaca {v.numero}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{v.secagemPrevista}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setVacaParaSecar({ vacaId: v.vacaId, numero: v.numero })}
                      className="rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                    >
                      Secar
                    </button>
                  </td>
                </tr>
              ))}
              {vacasPraSecar.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                    Nenhuma vaca pra secar nos próximos 30 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="flex items-center gap-2 text-base font-medium text-black dark:text-zinc-50">
              <span className="h-2 w-2 rounded-full bg-reproducao" aria-hidden="true" />
              Diagnósticos pendentes
            </p>
            <Link href="/reproducao" className="text-sm text-reproducao-ink hover:underline">
              Ver em Reprodução
            </Link>
          </div>
          <table className="w-full text-left text-base">
            <tbody>
              {diagnosticosPendentes.map((d, i) => (
                <tr
                  key={d.coberturaId}
                  className={`border-t border-black/[.08] dark:border-white/[.145] ${
                    i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-black dark:text-zinc-50">Vaca {d.numero}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{d.data_cobertura}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setCoberturaParaDiagnosticar({ coberturaId: d.coberturaId, numero: d.numero })
                      }
                      className="rounded-full border border-black/[.08] px-3 py-1 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                    >
                      Diagnóstico
                    </button>
                  </td>
                </tr>
              ))}
              {diagnosticosPendentes.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                    Nenhum diagnóstico pendente.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {vacaParaSecar && (
        <ConfirmarSecagemModal
          vaca={vacaParaSecar}
          onClose={() => setVacaParaSecar(null)}
          onSuccess={() => mostrarToast("Secagem confirmada!")}
        />
      )}

      {coberturaParaDiagnosticar && (
        <ConfirmarDiagnosticoModal
          cobertura={coberturaParaDiagnosticar}
          onClose={() => setCoberturaParaDiagnosticar(null)}
          onSuccess={() => mostrarToast("Diagnóstico confirmado!")}
        />
      )}
    </div>
  );
}
