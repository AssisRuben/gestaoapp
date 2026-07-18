"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { registrarLancamento, atualizarLancamento, deletarLancamento } from "./actions";
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
  "rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-sm font-medium text-black dark:text-zinc-50";

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
const CATEGORIAS_DESPESA = ["racao", "veterinario", "combustivel", "mao de obra", "manutencao", "insumos", "outros"];
const CATEGORIAS_RECEITA = ["venda de leite", "venda de animal", "outros"];

const CATEGORIA_LABEL: Record<string, string> = {
  racao: "Ração",
  veterinario: "Veterinário",
  combustivel: "Combustível",
  "mao de obra": "Mão de obra",
  manutencao: "Manutenção",
  insumos: "Insumos",
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

  useEffect(() => {
    if (criarState?.success) {
      criarFormRef.current?.reset();
      setDrawerAberto(false);
    }
  }, [criarState]);

  useEffect(() => {
    if (editarState?.success) {
      setLancamentoEmEdicao(null);
    }
  }, [editarState]);

  useEffect(() => {
    if (excluirState?.success) {
      setLancamentoParaExcluir(null);
    }
  }, [excluirState]);

  const lancamentosFiltrados = useMemo(
    () => lancamentos.filter((l) => l.data >= inicio && l.data <= fim),
    [lancamentos, inicio, fim],
  );

  const { totalReceitas, totalDespesas, grupos } = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    const gruposMap = new Map<string, number>();

    for (const l of lancamentosFiltrados) {
      if (l.tipo === "receita") receitas += Number(l.valor);
      else despesas += Number(l.valor);

      const chave = `${TIPO_LABEL[l.tipo] ?? l.tipo} - ${l.categoria ?? "outros"}`;
      gruposMap.set(chave, (gruposMap.get(chave) ?? 0) + Number(l.valor));
    }

    return {
      totalReceitas: receitas,
      totalDespesas: despesas,
      grupos: [...gruposMap.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [lancamentosFiltrados]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-20 sm:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="inicio" className={LABEL_CLASSES}>
              De
            </label>
            <input
              id="inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className={CAMPO_CLASSES}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="fim" className={LABEL_CLASSES}>
              Até
            </label>
            <input
              id="fim"
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className={CAMPO_CLASSES}
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Receitas</p>
          <p className="text-lg font-semibold text-brand-green">{formatarMoeda(totalReceitas)}</p>
        </div>
        <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Despesas</p>
          <p className="text-lg font-semibold text-red-600 dark:text-red-400">
            {formatarMoeda(totalDespesas)}
          </p>
        </div>
        <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Saldo</p>
          <p className="text-lg font-semibold text-black dark:text-zinc-50">
            {formatarMoeda(totalReceitas - totalDespesas)}
          </p>
        </div>
      </div>

      {grupos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">Tipo - Categoria</th>
                <th className="px-4 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map(([chave, total], i) => (
                <tr key={chave} className={i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : undefined}>
                  <td className="px-4 py-2 text-black dark:text-zinc-50">{chave}</td>
                  <td className="px-4 py-2 text-black dark:text-zinc-50">{formatarMoeda(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
        <table className="w-full min-w-[560px] text-left text-sm">
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

            <div className="mt-auto flex gap-2">
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
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 dark:bg-zinc-950"
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
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 dark:bg-zinc-950"
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
