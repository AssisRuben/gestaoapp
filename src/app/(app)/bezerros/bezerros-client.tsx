"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { cadastrarBezerro, atualizarBezerro, deletarBezerro } from "./actions";
import type { Bezerro, VacaOpcao } from "./types";

const SEXO_LABEL: Record<string, string> = {
  macho: "Macho",
  femea: "Fêmea",
  natimorto: "Natimorto",
};

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-transparent px-3 py-2 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-sm font-medium text-black dark:text-zinc-50";

function CamposBezerro({
  vacas,
  numeroObrigatorio,
  defaultNumero,
  defaultMaeId,
  defaultSexo,
  defaultDataNascimento,
}: {
  vacas: VacaOpcao[];
  numeroObrigatorio?: boolean;
  defaultNumero?: number;
  defaultMaeId?: string;
  defaultSexo?: string;
  defaultDataNascimento?: string;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="numero_identificacao" className={LABEL_CLASSES}>
          Número{numeroObrigatorio ? "" : " (opcional)"}
        </label>
        <input
          id="numero_identificacao"
          name="numero_identificacao"
          type="number"
          required={numeroObrigatorio}
          placeholder={numeroObrigatorio ? undefined : "automático"}
          defaultValue={defaultNumero}
          className={CAMPO_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mae_id" className={LABEL_CLASSES}>
          Mãe (opcional)
        </label>
        <select id="mae_id" name="mae_id" defaultValue={defaultMaeId ?? ""} className={CAMPO_CLASSES}>
          <option value="">Nenhuma</option>
          {vacas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.numero_identificacao}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="sexo" className={LABEL_CLASSES}>
          Sexo
        </label>
        <select id="sexo" name="sexo" defaultValue={defaultSexo ?? ""} className={CAMPO_CLASSES}>
          <option value="">Não informado</option>
          <option value="macho">Macho</option>
          <option value="femea">Fêmea</option>
          <option value="natimorto">Natimorto</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="data_nascimento" className={LABEL_CLASSES}>
          Data de nascimento
        </label>
        <input
          id="data_nascimento"
          name="data_nascimento"
          type="date"
          defaultValue={defaultDataNascimento ?? ""}
          className={CAMPO_CLASSES}
        />
      </div>
    </>
  );
}

export function BezerrosClient({ bezerros, vacas }: { bezerros: Bezerro[]; vacas: VacaOpcao[] }) {
  const [busca, setBusca] = useState("");
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [bezerroEmEdicao, setBezerroEmEdicao] = useState<Bezerro | null>(null);
  const [bezerroParaExcluir, setBezerroParaExcluir] = useState<Bezerro | null>(null);

  const [criarState, criarAction, criarPending] = useActionState(cadastrarBezerro, undefined);
  const criarFormRef = useRef<HTMLFormElement>(null);

  const [editarState, editarAction, editarPending] = useActionState(atualizarBezerro, undefined);
  const [excluirState, excluirAction, excluirPending] = useActionState(deletarBezerro, undefined);

  useEffect(() => {
    if (criarState?.success) {
      criarFormRef.current?.reset();
      setDrawerAberto(false);
    }
  }, [criarState]);

  useEffect(() => {
    if (editarState?.success) {
      setBezerroEmEdicao(null);
    }
  }, [editarState]);

  useEffect(() => {
    if (excluirState?.success) {
      setBezerroParaExcluir(null);
    }
  }, [excluirState]);

  const bezerrosFiltrados = useMemo(() => {
    if (!busca.trim()) return bezerros;
    return bezerros.filter((b) => String(b.numero_identificacao).includes(busca.trim()));
  }, [bezerros, busca]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-20 sm:pb-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <input
          type="text"
          placeholder="Buscar por número..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`w-full sm:max-w-xs ${CAMPO_CLASSES}`}
        />
        <button
          type="button"
          onClick={() => setDrawerAberto(true)}
          className="hidden whitespace-nowrap rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark sm:inline-flex"
        >
          Novo bezerro
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-black/[.08] dark:border-white/[.145]">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Mãe</th>
              <th className="px-4 py-2 font-medium">Sexo</th>
              <th className="px-4 py-2 font-medium">Nascimento</th>
              <th className="px-4 py-2 font-medium">Virou vaca?</th>
            </tr>
          </thead>
          <tbody>
            {bezerrosFiltrados.map((bezerro, i) => (
              <tr
                key={bezerro.id}
                onClick={() => setBezerroEmEdicao(bezerro)}
                className={`cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                  i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                }`}
              >
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {bezerro.numero_identificacao}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {bezerro.mae ? bezerro.mae.numero_identificacao : "—"}
                </td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {bezerro.sexo ? SEXO_LABEL[bezerro.sexo] ?? bezerro.sexo : "—"}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {bezerro.data_nascimento ?? "—"}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {bezerro.vaca_gerada
                    ? `Vaca ${bezerro.vaca_gerada.numero_identificacao}`
                    : "Ainda bezerro"}
                </td>
              </tr>
            ))}
            {bezerrosFiltrados.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                  Nenhum bezerro cadastrado ainda.
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
        + Novo bezerro
      </button>

      {drawerAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAberto(false)} />
          <form
            ref={criarFormRef}
            action={criarAction}
            className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-white p-6 dark:bg-zinc-950"
          >
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Novo bezerro</h2>

            <CamposBezerro vacas={vacas} />

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

      {bezerroEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setBezerroEmEdicao(null)} />
          <form
            key={bezerroEmEdicao.id}
            action={editarAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="bezerro_id" value={bezerroEmEdicao.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Editar bezerro {bezerroEmEdicao.numero_identificacao}
            </h2>

            <CamposBezerro
              vacas={vacas}
              numeroObrigatorio
              defaultNumero={bezerroEmEdicao.numero_identificacao}
              defaultMaeId={bezerroEmEdicao.mae_id ?? ""}
              defaultSexo={bezerroEmEdicao.sexo ?? ""}
              defaultDataNascimento={bezerroEmEdicao.data_nascimento ?? ""}
            />

            {editarState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{editarState.error}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setBezerroParaExcluir(bezerroEmEdicao);
                  setBezerroEmEdicao(null);
                }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Excluir
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBezerroEmEdicao(null)}
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

      {bezerroParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setBezerroParaExcluir(null)} />
          <form
            action={excluirAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-lg bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="bezerro_id" value={bezerroParaExcluir.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Excluir bezerro?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Bezerro {bezerroParaExcluir.numero_identificacao}. Essa ação não pode ser desfeita.
            </p>

            {excluirState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{excluirState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setBezerroParaExcluir(null)}
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
