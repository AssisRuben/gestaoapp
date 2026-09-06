"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { registrarLancamento, atualizarLancamento, deletarLancamento } from "./actions";
import { MobileCardList, MobileCard, CardHeader, CardRow } from "../mobile-list";
import { useSuccessToast, SuccessToast } from "../toast";
import type { Lancamento } from "./types";

const TIPO_LABEL: Record<string, string> = {
  receita: "Receita",
  despesa: "Despesa",
};

const TIPO_CLASSES: Record<string, string> = {
  receita: "text-brand-green font-medium",
  despesa: "text-red-600 dark:text-red-400",
};

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMesAtualStr() {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return d.toISOString().slice(0, 10);
}

// Mesmas categorias e mesmo formato (minúsculo, sem acento) que o prompt do agente de IA do
// bot de WhatsApp usa/normaliza — assim os dados batem independente de quem lançou.
const CATEGORIAS_DESPESA = [
  "racao",
  "medicacao",
  "veterinario",
  "combustivel",
  "energia eletrica",
  "mao de obra",
  "manutencao",
  "produtos da ordenha",
  "inseminacao artificial",
  "custo com pastagem",
  "outros",
];
const CATEGORIAS_RECEITA = ["venda de leite", "venda de animal", "outros"];

const CATEGORIA_LABEL: Record<string, string> = {
  racao: "Ração",
  medicacao: "Medicação",
  veterinario: "Veterinário",
  combustivel: "Combustível",
  "energia eletrica": "Energia elétrica",
  "mao de obra": "Mão de obra",
  manutencao: "Manutenção",
  "produtos da ordenha": "Produtos da ordenha",
  "inseminacao artificial": "Inseminação artificial",
  "custo com pastagem": "Custo com pastagem",
  "venda de leite": "Venda de leite",
  "venda de animal": "Venda de animal",
  outros: "Outros",
};

function CampoValorMoeda({ defaultValor }: { defaultValor?: number }) {
  const [centavos, setCentavos] = useState(() => Math.round((defaultValor ?? 0) * 100));

  const exibicao = (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const valorReal = (centavos / 100).toFixed(2);

  return (
    <>
      <input
        id="valor"
        type="text"
        inputMode="numeric"
        value={exibicao}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, "");
          setCentavos(digitos ? Number(digitos) : 0);
        }}
        className={CAMPO_CLASSES}
      />
      <input type="hidden" name="valor" value={valorReal} />
    </>
  );
}

function CamposLancamento({
  defaultTipo,
  defaultCategoria,
  defaultValor,
  defaultData,
}: {
  defaultTipo?: string;
  defaultCategoria?: string;
  defaultValor?: number;
  defaultData?: string;
}) {
  const [tipo, setTipo] = useState(defaultTipo ?? "despesa");
  const categorias = tipo === "receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA;
  const categoriaInicial =
    defaultCategoria && categorias.includes(defaultCategoria) ? defaultCategoria : categorias[0];

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="tipo" className={LABEL_CLASSES}>
          Tipo
        </label>
        <select
          id="tipo"
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className={CAMPO_CLASSES}
        >
          <option value="despesa">Despesa</option>
          <option value="receita">Receita</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="categoria" className={LABEL_CLASSES}>
          Categoria
        </label>
        <select
          id="categoria"
          name="categoria"
          key={tipo}
          defaultValue={categoriaInicial}
          className={CAMPO_CLASSES}
        >
          {categorias.map((c) => (
            <option key={c} value={c}>
              {CATEGORIA_LABEL[c] ?? c}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="valor" className={LABEL_CLASSES}>
          Valor
        </label>
        <CampoValorMoeda defaultValor={defaultValor} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="data" className={LABEL_CLASSES}>
          Data
        </label>
        <input
          id="data"
          name="data"
          type="date"
          required
          defaultValue={defaultData ?? hojeStr()}
          className={CAMPO_CLASSES}
        />
      </div>
    </>
  );
}

export function FinanceiroClient({ lancamentos }: { lancamentos: Lancamento[] }) {
  const [inicio, setInicio] = useState(primeiroDiaMesAtualStr());
  const [fim, setFim] = useState(hojeStr());
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [lancamentoEmEdicao, setLancamentoEmEdicao] = useState<Lancamento | null>(null);
  const [lancamentoParaExcluir, setLancamentoParaExcluir] = useState<Lancamento | null>(null);

  const [criarState, criarAction, criarPending] = useActionState(registrarLancamento, undefined);
  const criarFormRef = useRef<HTMLFormElement>(null);

  const [editarState, editarAction, editarPending] = useActionState(atualizarLancamento, undefined);
  const [excluirState, excluirAction, excluirPending] = useActionState(deletarLancamento, undefined);

  const { mensagemToast, mostrarToast } = useSuccessToast();

  useEffect(() => {
    if (criarState?.success) {
      queueMicrotask(() => {
        criarFormRef.current?.reset();
        setDrawerAberto(false);
        mostrarToast("Lançamento salvo!");
      });
    }
  }, [criarState, mostrarToast]);

  useEffect(() => {
    if (editarState?.success) {
      queueMicrotask(() => {
        setLancamentoEmEdicao(null);
        mostrarToast("Lançamento atualizado!");
      });
    }
  }, [editarState, mostrarToast]);

  useEffect(() => {
    if (excluirState?.success) {
      queueMicrotask(() => {
        setLancamentoParaExcluir(null);
        mostrarToast("Lançamento excluído!");
      });
    }
  }, [excluirState, mostrarToast]);

  const lancamentosFiltrados = useMemo(
    () => lancamentos.filter((l) => l.data >= inicio && l.data <= fim),
    [lancamentos, inicio, fim],
  );

  const { totalReceitas, totalDespesas } = useMemo(() => {
    let receitas = 0;
    let despesas = 0;

    for (const l of lancamentosFiltrados) {
      if (l.tipo === "receita") receitas += Number(l.valor);
      else despesas += Number(l.valor);
    }

    return { totalReceitas: receitas, totalDespesas: despesas };
  }, [lancamentosFiltrados]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-20 sm:pb-0">
      <SuccessToast mensagem={mensagemToast} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-row items-end gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="inicio" className={LABEL_CLASSES}>
              De
            </label>
            <input
              id="inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className={`w-full ${CAMPO_CLASSES}`}
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="fim" className={LABEL_CLASSES}>
              Até
            </label>
            <input
              id="fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className={`w-full ${CAMPO_CLASSES}`}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDrawerAberto(true)}
          className="hidden whitespace-nowrap rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark sm:inline-flex"
        >
          Novo lançamento
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center dark:border-white/[.145]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-green/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-brand-green" aria-hidden="true">
              <path d="M6 17L12 11L16 15L21 8" />
              <path d="M15 8h6v6" />
            </svg>
          </span>
          <p className="font-mono text-base font-bold tabular-nums text-brand-green">{formatarMoeda(totalReceitas)}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Receitas</p>
        </div>
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center dark:border-white/[.145]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-600/10 dark:bg-red-400/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-red-600 dark:text-red-400" aria-hidden="true">
              <path d="M6 8L12 14L16 10L21 17" />
              <path d="M15 17h6v-6" />
            </svg>
          </span>
          <p className="font-mono text-base font-bold tabular-nums text-red-600 dark:text-red-400">
            {formatarMoeda(totalDespesas)}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Despesas</p>
        </div>
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center dark:border-white/[.145]">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-financeiro-tint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-financeiro-ink" aria-hidden="true">
              <rect x="3" y="6" width="18" height="12" rx="2" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <p className="font-mono text-base font-bold tabular-nums text-black dark:text-zinc-50">
            {formatarMoeda(totalReceitas - totalDespesas)}
          </p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Saldo</p>
        </div>
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border bg-surface border-black/[.08] sm:block dark:border-white/[.145]">
        <table className="w-full text-left text-base">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Tipo</th>
              <th className="px-4 py-2 font-medium">Categoria</th>
              <th className="px-4 py-2 font-medium">Valor</th>
            </tr>
          </thead>
          <tbody>
            {lancamentosFiltrados.map((lancamento, i) => (
              <tr
                key={lancamento.id}
                onClick={() => setLancamentoEmEdicao(lancamento)}
                className={`cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                  i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                }`}
              >
                <td className="px-4 py-2 text-black dark:text-zinc-50">{lancamento.data}</td>
                <td className={`px-4 py-2 ${TIPO_CLASSES[lancamento.tipo]}`}>
                  {TIPO_LABEL[lancamento.tipo] ?? lancamento.tipo}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {lancamento.categoria ?? "outros"}
                </td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {formatarMoeda(Number(lancamento.valor))}
                </td>
              </tr>
            ))}
            {lancamentosFiltrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                  Nenhum lançamento nesse período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <MobileCardList>
        {lancamentosFiltrados.map((lancamento) => (
          <MobileCard key={lancamento.id} onClick={() => setLancamentoEmEdicao(lancamento)}>
            <CardHeader
              title={lancamento.categoria ?? "outros"}
              accentClassName="bg-financeiro"
              badge={
                <span className={`font-medium ${TIPO_CLASSES[lancamento.tipo]}`}>
                  {formatarMoeda(Number(lancamento.valor))}
                </span>
              }
            />
            <CardRow label="Tipo" value={TIPO_LABEL[lancamento.tipo] ?? lancamento.tipo} />
            <CardRow label="Data" value={lancamento.data} />
          </MobileCard>
        ))}
        {lancamentosFiltrados.length === 0 && (
          <p className="rounded-2xl border bg-surface border-black/[.08] p-4 text-center text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
            Nenhum lançamento nesse período.
          </p>
        )}
      </MobileCardList>

      <button
        type="button"
        onClick={() => setDrawerAberto(true)}
        className="fixed bottom-20 right-4 z-30 rounded-full bg-brand-green px-5 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-brand-green-dark sm:hidden"
      >
        + Novo lançamento
      </button>

      {drawerAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAberto(false)} />
          <form
            ref={criarFormRef}
            action={criarAction}
            className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-white p-6 dark:bg-zinc-950"
          >
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Novo lançamento</h2>

            <CamposLancamento />

            {criarState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{criarState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDrawerAberto(false)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={criarPending}
                className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
              >
                {criarPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {lancamentoEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setLancamentoEmEdicao(null)} />
          <form
            key={lancamentoEmEdicao.id}
            action={editarAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="id" value={lancamentoEmEdicao.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Editar lançamento</h2>

            <CamposLancamento
              defaultTipo={lancamentoEmEdicao.tipo}
              defaultCategoria={lancamentoEmEdicao.categoria ?? ""}
              defaultValor={Number(lancamentoEmEdicao.valor)}
              defaultData={lancamentoEmEdicao.data}
            />

            {editarState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{editarState.error}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setLancamentoParaExcluir(lancamentoEmEdicao);
                  setLancamentoEmEdicao(null);
                }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Excluir
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLancamentoEmEdicao(null)}
                  className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editarPending}
                  className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
                >
                  {editarPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {lancamentoParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setLancamentoParaExcluir(null)}
          />
          <form
            action={excluirAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="id" value={lancamentoParaExcluir.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Excluir lançamento?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {TIPO_LABEL[lancamentoParaExcluir.tipo]} de{" "}
              {formatarMoeda(Number(lancamentoParaExcluir.valor))} em{" "}
              {lancamentoParaExcluir.categoria ?? "outros"} ({lancamentoParaExcluir.data}). Essa ação
              não pode ser desfeita.
            </p>

            {excluirState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{excluirState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLancamentoParaExcluir(null)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={excluirPending}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {excluirPending ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
