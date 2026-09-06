"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  registrarCobertura,
  atualizarCobertura,
  deletarCobertura,
  registrarParto,
  atualizarParto,
  deletarParto,
} from "./actions";
import { MobileCardList, MobileCard, CardHeader, CardRow, EmptyCard } from "../mobile-list";
import { useSuccessToast, SuccessToast } from "../toast";
import type { Cobertura, Parto, VacaOpcao } from "./types";

const SEXO_BEZERRO_LABEL: Record<string, string> = {
  macho: "Macho",
  femea: "Fêmea",
  natimorto: "Natimorto",
};

const DIAGNOSTICO_LABEL: Record<string, string> = {
  pendente: "Pendente",
  positivo: "Positivo",
  negativo: "Negativo",
};

const DIAGNOSTICO_CLASSES: Record<string, string> = {
  pendente: "text-zinc-600 dark:text-zinc-400",
  positivo: "text-brand-green font-medium",
  negativo: "text-red-600 dark:text-red-400",
};

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function ReproducaoClient({
  coberturas,
  partos,
  vacas,
}: {
  coberturas: Cobertura[];
  partos: Parto[];
  vacas: VacaOpcao[];
}) {
  const [busca, setBusca] = useState("");
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [coberturaEmEdicao, setCoberturaEmEdicao] = useState<Cobertura | null>(null);
  const [coberturaParaExcluir, setCoberturaParaExcluir] = useState<Cobertura | null>(null);
  const [drawerPartoAberto, setDrawerPartoAberto] = useState(false);
  const [partoEmEdicao, setPartoEmEdicao] = useState<Parto | null>(null);
  const [partoParaExcluir, setPartoParaExcluir] = useState<Parto | null>(null);

  const [criarState, criarAction, criarPending] = useActionState(registrarCobertura, undefined);
  const criarFormRef = useRef<HTMLFormElement>(null);

  const [editarState, editarAction, editarPending] = useActionState(atualizarCobertura, undefined);
  const [excluirState, excluirAction, excluirPending] = useActionState(deletarCobertura, undefined);

  const [partoState, partoAction, partoPending] = useActionState(registrarParto, undefined);
  const partoFormRef = useRef<HTMLFormElement>(null);

  const [editarPartoState, editarPartoAction, editarPartoPending] = useActionState(
    atualizarParto,
    undefined,
  );
  const [excluirPartoState, excluirPartoAction, excluirPartoPending] = useActionState(
    deletarParto,
    undefined,
  );

  const { mensagemToast, mostrarToast } = useSuccessToast();

  useEffect(() => {
    if (criarState?.success) {
      queueMicrotask(() => {
        criarFormRef.current?.reset();
        setDrawerAberto(false);
        mostrarToast("Cobertura registrada!");
      });
    }
  }, [criarState, mostrarToast]);

  useEffect(() => {
    if (editarState?.success) {
      queueMicrotask(() => {
        setCoberturaEmEdicao(null);
        mostrarToast("Cobertura atualizada!");
      });
    }
  }, [editarState, mostrarToast]);

  useEffect(() => {
    if (excluirState?.success) {
      queueMicrotask(() => {
        setCoberturaParaExcluir(null);
        mostrarToast("Cobertura excluída!");
      });
    }
  }, [excluirState, mostrarToast]);

  useEffect(() => {
    if (partoState?.success) {
      queueMicrotask(() => {
        partoFormRef.current?.reset();
        setDrawerPartoAberto(false);
        mostrarToast("Parto registrado!");
      });
    }
  }, [partoState, mostrarToast]);

  useEffect(() => {
    if (editarPartoState?.success) {
      queueMicrotask(() => {
        setPartoEmEdicao(null);
        mostrarToast("Parto atualizado!");
      });
    }
  }, [editarPartoState, mostrarToast]);

  useEffect(() => {
    if (excluirPartoState?.success) {
      queueMicrotask(() => {
        setPartoParaExcluir(null);
        mostrarToast("Parto excluído!");
      });
    }
  }, [excluirPartoState, mostrarToast]);

  const coberturasFiltradas = useMemo(() => {
    if (!busca.trim()) return coberturas;
    return coberturas.filter((c) => String(c.vaca.numero_identificacao) === busca.trim());
  }, [coberturas, busca]);

  const partosFiltrados = useMemo(() => {
    if (!busca.trim()) return partos;
    return partos.filter((p) => String(p.vaca.numero_identificacao) === busca.trim());
  }, [partos, busca]);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-20 sm:pb-0">
      <SuccessToast mensagem={mensagemToast} />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Coberturas</h2>
        <button
          type="button"
          onClick={() => setDrawerAberto(true)}
          className="whitespace-nowrap rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
        >
          + Nova Cobertura
        </button>
      </div>

      <input
        type="text"
        placeholder="Buscar por número da vaca..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className={`w-full sm:max-w-xs ${CAMPO_CLASSES}`}
      />

      <div className="hidden overflow-x-auto rounded-2xl border bg-surface border-black/[.08] sm:block dark:border-white/[.145]">
        <table className="w-full text-left text-base">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Vaca</th>
              <th className="px-4 py-2 font-medium">Data cobertura</th>
              <th className="px-4 py-2 font-medium">Touro/Sêmen</th>
              <th className="px-4 py-2 font-medium">Diagnóstico</th>
              <th className="px-4 py-2 font-medium">Parto previsto</th>
              <th className="px-4 py-2 font-medium">Secagem prevista</th>
            </tr>
          </thead>
          <tbody>
            {coberturasFiltradas.map((cobertura, i) => {
              const partoPrevisto =
                cobertura.diagnostico_prenhez === "positivo"
                  ? somarDias(cobertura.data_cobertura, 283)
                  : null;
              const secagemPrevista = partoPrevisto ? somarDias(partoPrevisto, -60) : null;

              return (
                <tr
                  key={cobertura.id}
                  onClick={() => setCoberturaEmEdicao(cobertura)}
                  className={`cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                    i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-black dark:text-zinc-50">
                    {cobertura.vaca.numero_identificacao}
                  </td>
                  <td className="px-4 py-2 text-black dark:text-zinc-50">
                    {cobertura.data_cobertura}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {cobertura.touro_semen ?? "—"}
                  </td>
                  <td className={`px-4 py-2 ${DIAGNOSTICO_CLASSES[cobertura.diagnostico_prenhez]}`}>
                    {DIAGNOSTICO_LABEL[cobertura.diagnostico_prenhez] ?? cobertura.diagnostico_prenhez}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {partoPrevisto ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {secagemPrevista ?? "—"}
                  </td>
                </tr>
              );
            })}
            {coberturasFiltradas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                  Nenhuma cobertura registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <MobileCardList>
        {coberturasFiltradas.map((cobertura) => {
          const partoPrevisto =
            cobertura.diagnostico_prenhez === "positivo"
              ? somarDias(cobertura.data_cobertura, 283)
              : null;
          const secagemPrevista = partoPrevisto ? somarDias(partoPrevisto, -60) : null;

          return (
            <MobileCard key={cobertura.id} onClick={() => setCoberturaEmEdicao(cobertura)}>
              <CardHeader
                title={`Vaca ${cobertura.vaca.numero_identificacao}`}
                accentClassName="bg-reproducao"
                badge={
                  <span
                    className={`rounded-full bg-zinc-500/10 px-2 py-0.5 text-sm font-medium ${DIAGNOSTICO_CLASSES[cobertura.diagnostico_prenhez]}`}
                  >
                    {DIAGNOSTICO_LABEL[cobertura.diagnostico_prenhez] ?? cobertura.diagnostico_prenhez}
                  </span>
                }
              />
              <CardRow label="Data cobertura" value={cobertura.data_cobertura} />
              <CardRow label="Touro/Sêmen" value={cobertura.touro_semen ?? "—"} />
              <CardRow label="Parto previsto" value={partoPrevisto ?? "—"} />
              <CardRow label="Secagem prevista" value={secagemPrevista ?? "—"} />
            </MobileCard>
          );
        })}
        {coberturasFiltradas.length === 0 && (
          <EmptyCard>Nenhuma cobertura registrada ainda.</EmptyCard>
        )}
      </MobileCardList>

      <div className="mt-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Partos</h2>
        <button
          type="button"
          onClick={() => setDrawerPartoAberto(true)}
          className="whitespace-nowrap rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
        >
          + Novo Parto
        </button>
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border bg-surface border-black/[.08] sm:block dark:border-white/[.145]">
        <table className="w-full text-left text-base">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Vaca</th>
              <th className="px-4 py-2 font-medium">Data do parto</th>
              <th className="px-4 py-2 font-medium">IEP (dias)</th>
              <th className="px-4 py-2 font-medium">Lactação atual?</th>
            </tr>
          </thead>
          <tbody>
            {partosFiltrados.map((parto, i) => (
              <tr
                key={parto.id}
                onClick={() => setPartoEmEdicao(parto)}
                className={`cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                  i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                }`}
              >
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {parto.vaca.numero_identificacao}
                </td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">{parto.data_parto}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{parto.iep ?? "—"}</td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {parto.ativa ? "Sim" : "Não"}
                </td>
              </tr>
            ))}
            {partosFiltrados.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                  Nenhum parto registrado ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <MobileCardList>
        {partosFiltrados.map((parto) => (
          <MobileCard key={parto.id} onClick={() => setPartoEmEdicao(parto)}>
            <CardHeader
              title={`Vaca ${parto.vaca.numero_identificacao}`}
              accentClassName="bg-reproducao"
              badge={
                <span
                  className={`rounded-full px-2 py-0.5 text-sm font-medium ${
                    parto.ativa
                      ? "bg-brand-green/10 text-brand-green"
                      : "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400"
                  }`}
                >
                  {parto.ativa ? "Lactação atual" : "Encerrado"}
                </span>
              }
            />
            <CardRow label="Data do parto" value={parto.data_parto} />
            <CardRow label="IEP (dias)" value={parto.iep ?? "—"} />
          </MobileCard>
        ))}
        {partosFiltrados.length === 0 && <EmptyCard>Nenhum parto registrado ainda.</EmptyCard>}
      </MobileCardList>

      {drawerPartoAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerPartoAberto(false)} />
          <form
            ref={partoFormRef}
            action={partoAction}
            className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-white p-6 dark:bg-zinc-950"
          >
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Registrar parto</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Fecha a lactação atual da vaca, calcula o IEP, vincula a cobertura confirmada mais
              recente e cadastra o bezerro.
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor="parto_vaca_id" className={LABEL_CLASSES}>
                Vaca
              </label>
              <select
                id="parto_vaca_id"
                name="vaca_id"
                required
                defaultValue=""
                className={CAMPO_CLASSES}
              >
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
              <label htmlFor="data_parto" className={LABEL_CLASSES}>
                Data do parto
              </label>
              <input
                id="data_parto"
                name="data_parto"
                type="date"
                required
                defaultValue={hoje()}
                className={CAMPO_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="numero_bezerro" className={LABEL_CLASSES}>
                Número do bezerro (opcional)
              </label>
              <input
                id="numero_bezerro"
                name="numero_bezerro"
                type="number"
                placeholder="automático"
                className={CAMPO_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="sexo_bezerro" className={LABEL_CLASSES}>
                Sexo do bezerro
              </label>
              <select id="sexo_bezerro" name="sexo_bezerro" defaultValue="" className={CAMPO_CLASSES}>
                <option value="">Não informado</option>
                {Object.entries(SEXO_BEZERRO_LABEL).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>

            {partoState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{partoState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDrawerPartoAberto(false)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={partoPending}
                className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
              >
                {partoPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </div>
      )}

      {partoEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPartoEmEdicao(null)} />
          <form
            key={partoEmEdicao.id}
            action={editarPartoAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="parto_id" value={partoEmEdicao.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Editar parto — vaca {partoEmEdicao.vaca.numero_identificacao}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Só a data é editável (recalcula o IEP automaticamente). Pra corrigir o bezerro
              gerado por esse parto, edita direto na aba Bezerros.
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor="edit_data_parto" className={LABEL_CLASSES}>
                Data do parto
              </label>
              <input
                id="edit_data_parto"
                name="data_parto"
                type="date"
                required
                defaultValue={partoEmEdicao.data_parto}
                className={CAMPO_CLASSES}
              />
            </div>

            {editarPartoState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{editarPartoState.error}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setPartoParaExcluir(partoEmEdicao);
                  setPartoEmEdicao(null);
                }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Excluir
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPartoEmEdicao(null)}
                  className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editarPartoPending}
                  className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
                >
                  {editarPartoPending ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {drawerAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAberto(false)} />
          <form
            ref={criarFormRef}
            action={criarAction}
            className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-white p-6 dark:bg-zinc-950"
          >
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Nova cobertura</h2>

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
              <label htmlFor="data_cobertura" className={LABEL_CLASSES}>
                Data da cobertura
              </label>
              <input
                id="data_cobertura"
                name="data_cobertura"
                type="date"
                required
                defaultValue={hoje()}
                className={CAMPO_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="touro_semen" className={LABEL_CLASSES}>
                Touro/Sêmen (opcional)
              </label>
              <input id="touro_semen" name="touro_semen" type="text" className={CAMPO_CLASSES} />
            </div>

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

      {coberturaEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setCoberturaEmEdicao(null)} />
          <form
            key={coberturaEmEdicao.id}
            action={editarAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="cobertura_id" value={coberturaEmEdicao.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Editar cobertura — vaca {coberturaEmEdicao.vaca.numero_identificacao}
            </h2>

            <div className="flex flex-col gap-1">
              <label htmlFor="data_cobertura" className={LABEL_CLASSES}>
                Data da cobertura
              </label>
              <input
                id="data_cobertura"
                name="data_cobertura"
                type="date"
                required
                defaultValue={coberturaEmEdicao.data_cobertura}
                className={CAMPO_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="touro_semen" className={LABEL_CLASSES}>
                Touro/Sêmen (opcional)
              </label>
              <input
                id="touro_semen"
                name="touro_semen"
                type="text"
                defaultValue={coberturaEmEdicao.touro_semen ?? ""}
                className={CAMPO_CLASSES}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="diagnostico_prenhez" className={LABEL_CLASSES}>
                Diagnóstico de prenhez
              </label>
              <select
                id="diagnostico_prenhez"
                name="diagnostico_prenhez"
                defaultValue={coberturaEmEdicao.diagnostico_prenhez}
                className={CAMPO_CLASSES}
              >
                <option value="pendente">Pendente</option>
                <option value="positivo">Positivo</option>
                <option value="negativo">Negativo</option>
              </select>
            </div>

            {editarState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{editarState.error}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setCoberturaParaExcluir(coberturaEmEdicao);
                  setCoberturaEmEdicao(null);
                }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Excluir
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCoberturaEmEdicao(null)}
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

      {coberturaParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setCoberturaParaExcluir(null)}
          />
          <form
            action={excluirAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="cobertura_id" value={coberturaParaExcluir.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Excluir cobertura?
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Cobertura da vaca {coberturaParaExcluir.vaca.numero_identificacao} em{" "}
              {coberturaParaExcluir.data_cobertura}. Essa ação não pode ser desfeita.
            </p>

            {excluirState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{excluirState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCoberturaParaExcluir(null)}
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

      {partoParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPartoParaExcluir(null)} />
          <form
            action={excluirPartoAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="parto_id" value={partoParaExcluir.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Excluir parto?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Parto da vaca {partoParaExcluir.vaca.numero_identificacao} em{" "}
              {partoParaExcluir.data_parto}. Essa ação não pode ser desfeita — se houver bezerro
              ou leite vinculados, a exclusão vai ser bloqueada.
            </p>

            {excluirPartoState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{excluirPartoState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPartoParaExcluir(null)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={excluirPartoPending}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {excluirPartoPending ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
