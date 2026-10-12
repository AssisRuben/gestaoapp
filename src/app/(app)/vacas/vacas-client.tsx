"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cadastrarVaca, atualizarVaca, deletarVaca } from "./actions";
import { MobileCardList, MobileCard, CardHeader, CardRow, EmptyCard } from "../mobile-list";
import { useSuccessToast, SuccessToast } from "../toast";
import type { Vaca } from "./types";
import {
  CensoRebanho,
  chaveProdutivo,
  chaveReprodutivo,
  rotuloFiltro,
  type FiltroCenso,
} from "./censo-rebanho";

const STATUS_PRODUTIVO_LABEL: Record<string, string> = {
  novilha: "Novilha",
  lactacao: "Lactação",
  seca: "Seca",
};

const STATUS_REPRODUTIVO_LABEL: Record<string, string> = {
  vazia: "Vazia",
  prenhe: "Prenhe",
  vazia_em_servico: "Vazia em serviço",
};

const STATUS_PRODUTIVO_BADGE: Record<string, string> = {
  novilha: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400",
  lactacao: "bg-brand-green/10 text-brand-green",
  seca: "bg-amber-500/10 text-amber-700 dark:text-amber-500",
};

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

// "12 · Mimosa" quando a vaca tem nome; só o número quando não tem
function rotuloVaca(v: { numero_identificacao: number; nome?: string | null }) {
  return v.nome ? `${v.numero_identificacao} · ${v.nome}` : String(v.numero_identificacao);
}

function CamposVaca({
  vacas,
  excludeId,
  numeroObrigatorio,
  defaultNumero,
  defaultNome,
  defaultMaeId,
  defaultStatusProdutivo,
  defaultStatusReprodutivo,
}: {
  vacas: Vaca[];
  excludeId?: string;
  numeroObrigatorio?: boolean;
  defaultNumero?: number;
  defaultNome?: string;
  defaultMaeId?: string;
  defaultStatusProdutivo?: string;
  defaultStatusReprodutivo?: string;
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
        <label htmlFor="nome" className={LABEL_CLASSES}>
          Nome (opcional)
        </label>
        <input
          id="nome"
          name="nome"
          type="text"
          maxLength={60}
          placeholder="ex.: Mimosa"
          defaultValue={defaultNome}
          className={CAMPO_CLASSES}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="mae_id" className={LABEL_CLASSES}>
          Mãe (opcional)
        </label>
        <select id="mae_id" name="mae_id" defaultValue={defaultMaeId ?? ""} className={CAMPO_CLASSES}>
          <option value="">Nenhuma</option>
          {vacas
            .filter((v) => v.id !== excludeId)
            .map((v) => (
              <option key={v.id} value={v.id}>
                {rotuloVaca(v)}
              </option>
            ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status_produtivo" className={LABEL_CLASSES}>
          Status produtivo
        </label>
        <select
          id="status_produtivo"
          name="status_produtivo"
          defaultValue={defaultStatusProdutivo ?? "novilha"}
          className={CAMPO_CLASSES}
        >
          <option value="novilha">Novilha</option>
          <option value="lactacao">Lactação</option>
          <option value="seca">Seca</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="status_reprodutivo" className={LABEL_CLASSES}>
          Status reprodutivo
        </label>
        <select
          id="status_reprodutivo"
          name="status_reprodutivo"
          defaultValue={defaultStatusReprodutivo ?? "vazia"}
          className={CAMPO_CLASSES}
        >
          <option value="vazia">Vazia</option>
          <option value="prenhe">Prenhe</option>
          <option value="vazia_em_servico">Vazia em serviço</option>
        </select>
      </div>
    </>
  );
}

export function VacasClient({ vacas, editarId }: { vacas: Vaca[]; editarId?: string }) {
  const router = useRouter();
  const [busca, setBusca] = useState("");
  const [drawerAberto, setDrawerAberto] = useState(false);
  // "Editar cadastro" na ficha da vaca abre esta tela com ?editar=<id>
  const [vacaEmEdicao, setVacaEmEdicao] = useState<Vaca | null>(
    () => vacas.find((v) => v.id === editarId) ?? null,
  );

  // fechou a edição aberta pela ficha: tira o ?editar= do endereço pra recarregar não reabrir
  useEffect(() => {
    if (editarId && vacaEmEdicao === null) router.replace("/vacas", { scroll: false });
  }, [editarId, vacaEmEdicao, router]);
  const [vacaParaExcluir, setVacaParaExcluir] = useState<Vaca | null>(null);

  const [criarState, criarAction, criarPending] = useActionState(cadastrarVaca, undefined);
  const criarFormRef = useRef<HTMLFormElement>(null);

  const [editarState, editarAction, editarPending] = useActionState(atualizarVaca, undefined);
  const [excluirState, excluirAction, excluirPending] = useActionState(deletarVaca, undefined);

  const { mensagemToast, mostrarToast } = useSuccessToast();

  useEffect(() => {
    if (criarState?.success) {
      queueMicrotask(() => {
        criarFormRef.current?.reset();
        setDrawerAberto(false);
        mostrarToast("Vaca cadastrada!");
      });
    }
  }, [criarState, mostrarToast]);

  useEffect(() => {
    if (editarState?.success) {
      queueMicrotask(() => {
        setVacaEmEdicao(null);
        mostrarToast("Vaca atualizada!");
      });
    }
  }, [editarState, mostrarToast]);

  useEffect(() => {
    if (excluirState?.success) {
      queueMicrotask(() => {
        setVacaParaExcluir(null);
        mostrarToast("Vaca excluída!");
      });
    }
  }, [excluirState, mostrarToast]);

  const [filtroCenso, setFiltroCenso] = useState<FiltroCenso>({});

  const vacasFiltradas = useMemo(() => {
    let lista = vacas;
    if (filtroCenso.produtivo) lista = lista.filter((v) => chaveProdutivo(v) === filtroCenso.produtivo);
    if (filtroCenso.reprodutivo) lista = lista.filter((v) => chaveReprodutivo(v) === filtroCenso.reprodutivo);
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (termo) {
      lista = lista.filter(
        (v) => String(v.numero_identificacao) === termo || (v.nome ?? "").toLocaleLowerCase("pt-BR").includes(termo),
      );
    }
    return lista;
  }, [vacas, busca, filtroCenso]);

  const rotuloCenso = rotuloFiltro(filtroCenso);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-36 sm:pb-0">
      <SuccessToast mensagem={mensagemToast} />

      <CensoRebanho vacas={vacas} filtro={filtroCenso} onFiltrar={setFiltroCenso} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <input
          type="text"
          placeholder="Buscar por número ou nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className={`w-full sm:max-w-xs ${CAMPO_CLASSES}`}
        />
        <div className="flex gap-2">
          <Link
            href="/vacas/importar"
            className="whitespace-nowrap rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Importar planilha
          </Link>
          <button
            type="button"
            onClick={() => setDrawerAberto(true)}
            className="hidden whitespace-nowrap rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark sm:inline-flex"
          >
            Nova vaca
          </button>
        </div>
      </div>

      {rotuloCenso && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Mostrando:</span>
          <button
            type="button"
            onClick={() => setFiltroCenso({})}
            className="inline-flex items-center gap-1.5 rounded-full bg-vacas-tint px-3 py-1 font-medium text-vacas-ink"
          >
            {rotuloCenso}
            <span aria-hidden>✕</span>
            <span className="sr-only">(limpar filtro)</span>
          </button>
          <span className="text-zinc-600 dark:text-zinc-400">
            {vacasFiltradas.length} {vacasFiltradas.length === 1 ? "vaca" : "vacas"}
          </span>
        </div>
      )}

      <div className="hidden overflow-x-auto rounded-2xl border bg-surface border-black/[.08] sm:block dark:border-white/[.145]">
        <table className="w-full text-left text-base">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-4 py-2 font-medium">Número</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Status produtivo</th>
              <th className="px-4 py-2 font-medium">Status reprodutivo</th>
              <th className="px-4 py-2 font-medium">Mãe</th>
            </tr>
          </thead>
          <tbody>
            {vacasFiltradas.map((vaca, i) => (
              <tr
                key={vaca.id}
                onClick={() => router.push(`/vacas/${vaca.id}`)}
                className={`cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                  i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                }`}
              >
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {vaca.numero_identificacao}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{vaca.nome ?? "—"}</td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {STATUS_PRODUTIVO_LABEL[vaca.status_produtivo] ?? vaca.status_produtivo}
                </td>
                <td className="px-4 py-2 text-black dark:text-zinc-50">
                  {STATUS_REPRODUTIVO_LABEL[vaca.status_reprodutivo] ?? vaca.status_reprodutivo}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                  {vaca.mae ? vaca.mae.numero_identificacao : "—"}
                </td>
              </tr>
            ))}
            {vacasFiltradas.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                  Nenhuma vaca cadastrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <MobileCardList>
        {vacasFiltradas.map((vaca) => (
          <MobileCard key={vaca.id} onClick={() => router.push(`/vacas/${vaca.id}`)}>
            <CardHeader
              title={`Vaca ${rotuloVaca(vaca)}`}
              accentClassName="bg-vacas"
              badge={
                <span
                  className={`rounded-full px-2 py-0.5 text-sm font-medium ${
                    STATUS_PRODUTIVO_BADGE[vaca.status_produtivo] ?? "bg-zinc-500/10 text-zinc-600"
                  }`}
                >
                  {STATUS_PRODUTIVO_LABEL[vaca.status_produtivo] ?? vaca.status_produtivo}
                </span>
              }
            />
            <CardRow
              label="Status reprodutivo"
              value={STATUS_REPRODUTIVO_LABEL[vaca.status_reprodutivo] ?? vaca.status_reprodutivo}
            />
            <CardRow label="Mãe" value={vaca.mae ? vaca.mae.numero_identificacao : "—"} />
          </MobileCard>
        ))}
        {vacasFiltradas.length === 0 && <EmptyCard>Nenhuma vaca cadastrada ainda.</EmptyCard>}
      </MobileCardList>

      <button
        type="button"
        onClick={() => setDrawerAberto(true)}
        className="fixed bottom-20 right-4 z-30 rounded-full bg-brand-green px-5 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-brand-green-dark sm:hidden"
      >
        + Nova vaca
      </button>

      {drawerAberto && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAberto(false)} />
          <form
            ref={criarFormRef}
            action={criarAction}
            className="relative flex h-full w-full max-w-sm flex-col gap-4 overflow-y-auto bg-white p-6 dark:bg-zinc-950"
          >
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Nova vaca</h2>

            <CamposVaca vacas={vacas} />

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

      {vacaEmEdicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setVacaEmEdicao(null)} />
          <form
            key={vacaEmEdicao.id}
            action={editarAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="vaca_id" value={vacaEmEdicao.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
              Editar vaca {vacaEmEdicao.numero_identificacao}
            </h2>

            <CamposVaca
              vacas={vacas}
              excludeId={vacaEmEdicao.id}
              numeroObrigatorio
              defaultNumero={vacaEmEdicao.numero_identificacao}
              defaultNome={vacaEmEdicao.nome ?? ""}
              defaultMaeId={vacaEmEdicao.mae_id ?? ""}
              defaultStatusProdutivo={vacaEmEdicao.status_produtivo}
              defaultStatusReprodutivo={vacaEmEdicao.status_reprodutivo}
            />

            {editarState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{editarState.error}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setVacaParaExcluir(vacaEmEdicao);
                  setVacaEmEdicao(null);
                }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Excluir
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setVacaEmEdicao(null)}
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

      {vacaParaExcluir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setVacaParaExcluir(null)} />
          <form
            action={excluirAction}
            className="relative flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="vaca_id" value={vacaParaExcluir.id} />

            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Excluir vaca?</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Vaca {vacaParaExcluir.numero_identificacao}. Essa ação não pode ser desfeita.
            </p>

            {excluirState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{excluirState.error}</p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setVacaParaExcluir(null)}
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
