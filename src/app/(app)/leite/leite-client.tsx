"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { registrarLeite, atualizarLeite, deletarLeite } from "./actions";
import type { RegistroLeite, VacaOpcao } from "./types";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-sm font-medium text-black dark:text-zinc-50";

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function primeiroDiaMesAtualStr() {
  const hoje = new Date();
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return d.toISOString().slice(0, 10);
}

function formatarLitros(litros: number) {
  return `${litros.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} L`;
}

export function LeiteClient({ registros, vacas }: { registros: RegistroLeite[]; vacas: VacaOpcao[] }) {
  const [inicio, setInicio] = useState(primeiroDiaMesAtualStr());
  const [fim, setFim] = useState(hojeStr());
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [registroEmEdicao, setRegistroEmEdicao] = useState<RegistroLeite | null>(null);
  const [registroParaExcluir, setRegistroParaExcluir] = useState<RegistroLeite | null>(null);

  const [criarState, criarAction, criarPending] = useActionState(registrarLeite, undefined);
  const criarFormRef = useRef<HTMLFormElement>(null);

  const [editarState, editarAction, editarPending] = useActionState(atualizarLeite, undefined);
  const [excluirState, excluirAction, excluirPending] = useActionState(deletarLeite, undefined);

  useEffect(() => {
    if (criarState?.success) {
      criarFormRef.current?.reset();
      setDrawerAberto(false);
    }
  }, [criarState]);

  useEffect(() => {
    if (editarState?.success) {
      setRegistroEmEdicao(null);
    }
  }, [editarState]);

  useEffect(() => {
    if (excluirState?.success) {
      setRegistroParaExcluir(null);
    }
  }, [excluirState]);

  const registrosFiltrados = useMemo(
    () => registros.filter((r) => r.data_controle >= inicio && r.data_controle <= fim),
    [registros, inicio, fim],
  );

  const { totalLitros, porVaca } = useMemo(() => {
    let total = 0;
    const mapa = new Map<number, number>();

    for (const r of registrosFiltrados) {
      total += Number(r.litros);
      mapa.set(
        r.vaca.numero_identificacao,
        (mapa.get(r.vaca.numero_identificacao) ?? 0) + Number(r.litros),
      );
    }

    return {
      totalLitros: total,
      porVaca: [...mapa.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [registrosFiltrados]);

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
          Novo registro
        </button>
      </div>

      <div className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Total no período</p>
        <p className="text-lg font-semibold text-black dark:text-zinc-50">
          {formatarLitros(totalLitros)}
        </p>
      </div>

      {porVaca.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <table className="w-full min-w-[320px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                <th className="px-4 py-2 font-medium">Vaca</th>
                <th className="px-4 py-2 font-medium">Total no período</th>
              </tr>
            </thead>
            <tbody>
              {porVaca.map(([numero, total], i) => (
                <tr key={numero} className={i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : undefined}>
                  <td className="px-4 py-2 text-black dark:text-zinc-50">{numero}</td>
                  <td className="px-4 py-2 text-black dark:text-zinc-50">{formatarLitros(total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Vaca</th>
              <th className="px-4 py-2 font-medium">Data</th>
              <th className="px-4 py-2 font-medium">Litros</th>
            </tr>
          </thead>
          <tbody>
            {registrosFiltrados.map((registro, i) => (
              <tr
                key={registro.id}
                onClick={() => setRegistroEmEdicao(registro)}
                className={`cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                  i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                }`}
              >
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {registro.vaca.numero_identificacao}
                </td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">{registro.data_controle}</td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {formatarLitros(Number(registro.litros))}
                </td>
              </tr>
            ))}
            {registrosFiltrados.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                  Nenhum registro nesse período.
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
        + Novo registro
      </button>

      {drawerAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAberto(false)} />
          <form
            ref={criarFormRef}
            action={criarAction}
            className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-white p-6 dark:bg-zinc-950"
          >
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Novo registro</h2>

            <div className="flex flex-col gap-1">
              <label htmlFor="vaca_id" className={LABEL_CLASSES}>
                Vaca
              </label>
              <select id="vaca_id" name="vaca_id" required defaultValue="" className={CAMPO_CLASSES}>
                <option value="" disabled>
                  Selecione
                </option>
                {vacas.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.numero_identificacao}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="litros" className={LABEL_CLASSES}>
                Litros
              </label>
              <input
                id="litros"
                name="litros"
                type="number"
                step="0.1"
                min="0"
                required
                className={CAMPO_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="data_controle" className={LABEL_CLASSES}>
                Data
              </label>
              <input
                id="data_controle"
                name="data_controle"
                type="date"
                required
                defaultValue={hojeStr()}
                className={CAMPO_CLASSES}
              />
            </div>

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

      {registroEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRegistroEmEdicao(null)} />
          <form
            key={registroEmEdicao.id}
            action={editarAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="registro_id" value={registroEmEdicao.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Editar registro — vaca {registroEmEdicao.vaca.numero_identificacao}
            </h2>

            <div className="flex flex-col gap-1">
              <label htmlFor="edit_litros" className={LABEL_CLASSES}>
                Litros
              </label>
              <input
                id="edit_litros"
                name="litros"
                type="number"
                step="0.1"
                min="0"
                required
                defaultValue={registroEmEdicao.litros}
                className={CAMPO_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="edit_data_controle" className={LABEL_CLASSES}>
                Data
              </label>
              <input
                id="edit_data_controle"
                name="data_controle"
                type="date"
                required
                defaultValue={registroEmEdicao.data_controle}
                className={CAMPO_CLASSES}
              />
            </div>

            {editarState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{editarState.error}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setRegistroParaExcluir(registroEmEdicao);
                  setRegistroEmEdicao(null);
                }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Excluir
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRegistroEmEdicao(null)}
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

      {registroParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setRegistroParaExcluir(null)} />
          <form
            action={excluirAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="registro_id" value={registroParaExcluir.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Excluir registro?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Vaca {registroParaExcluir.vaca.numero_identificacao} — {formatarLitros(Number(registroParaExcluir.litros))} em{" "}
              {registroParaExcluir.data_controle}. Essa ação não pode ser desfeita.
            </p>

            {excluirState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{excluirState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRegistroParaExcluir(null)}
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
