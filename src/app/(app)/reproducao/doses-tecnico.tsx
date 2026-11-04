"use client";

import { useActionState, useEffect, useState } from "react";
import {
  confirmarDosesTecnico,
  registrarBaixaDosesTecnico,
  deletarBaixaDosesTecnico,
  transferirDosesTecnico,
  cancelarTransferenciaDoses,
} from "./actions";
import { formatarDataBR } from "../format";
import { rotuloTouro } from "@/lib/programa";
import type { Touro, DosesTecnico } from "./types";
import { BaixaModal, ListaBaixas } from "./doses-programa";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

// Bloco "Minhas doses (técnico)" (0055): só aparece pra quem recebeu doses do programa como técnico.
// As doses são da pessoa, não da fazenda: o mesmo saldo aparece em qualquer fazenda que ela abrir.
export function DosesTecnicoBloco({
  touros,
  doses,
  nomeFazenda,
  onSucesso,
}: {
  touros: Touro[];
  doses: DosesTecnico;
  nomeFazenda: string;
  onSucesso: (mensagem: string) => void;
}) {
  const [confirmarState, confirmarAction, confirmando] = useActionState(confirmarDosesTecnico, undefined);
  const [cancelarState, cancelarAction, cancelando] = useActionState(cancelarTransferenciaDoses, undefined);
  const [baixaAberta, setBaixaAberta] = useState(false);
  const [transferirAberta, setTransferirAberta] = useState(false);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);

  useEffect(() => {
    if (confirmarState?.success) queueMicrotask(() => onSucesso("Recebimento confirmado! As doses estão no seu saldo."));
  }, [confirmarState, onSucesso]);
  useEffect(() => {
    if (cancelarState?.success) {
      queueMicrotask(() => {
        setCancelandoId(null);
        onSucesso("Transferência cancelada — as doses voltaram pro seu saldo.");
      });
    }
  }, [cancelarState, onSucesso]);

  const pendentes = doses.entregas.filter((e) => !e.recebido_em);
  const tourosPorId = new Map(touros.map((t) => [t.id, t]));
  const saldosVisiveis = doses.saldos.filter((s) => s.recebidas + s.a_receber + s.utilizadas + s.baixas + s.transferidas > 0);
  const comSaldo = saldosVisiveis.filter((s) => s.saldo > 0);

  if (pendentes.length === 0 && saldosVisiveis.length === 0 && doses.transferencias.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Minhas doses (técnico)</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ficam com você e servem pra qualquer fazenda que você atende.
          </p>
        </div>
        {comSaldo.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setTransferirAberta(true)}
              className="text-sm font-medium text-brand-green hover:underline"
            >
              Passar doses pra esta fazenda
            </button>
            <button
              type="button"
              onClick={() => setBaixaAberta(true)}
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Registrar perda
            </button>
          </div>
        )}
      </div>

      {pendentes.map((entrega) => (
        <form
          key={entrega.id}
          action={confirmarAction}
          className="flex flex-col gap-2 rounded-xl bg-financeiro-tint p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <input type="hidden" name="entrega_id" value={entrega.id} />
          <p className="flex flex-col gap-0.5 text-base text-financeiro-ink">
            <span>
              <span className="font-semibold">
                {entrega.quantidade} {entrega.quantidade === 1 ? "dose" : "doses"}
              </span>{" "}
              de {rotuloTouro(entrega.touro)}
              {entrega.kits ? ` (${entrega.kits} ${entrega.kits === 1 ? "kit" : "kits"})` : ""} enviadas pra você em{" "}
              {formatarDataBR(entrega.data_entrega)}
              {entrega.observacao ? ` — ${entrega.observacao}` : ""}
            </span>
            {entrega.entidade && (
              <span className="text-sm">
                Retirar com {entrega.entidade.nome}
                {entrega.entidade.responsavel ? ` · ${entrega.entidade.responsavel}` : ""}
                {entrega.entidade.telefone ? ` · ${entrega.entidade.telefone}` : ""}
              </span>
            )}
          </p>
          <button
            type="submit"
            disabled={confirmando}
            className="shrink-0 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
          >
            {confirmando ? "Confirmando..." : "Confirmar recebimento"}
          </button>
        </form>
      ))}
      {confirmarState?.error && <p className="text-sm text-red-600 dark:text-red-400">{confirmarState.error}</p>}

      {saldosVisiveis.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-base">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                <th className="py-2 pr-4 font-medium">Touro</th>
                <th className="py-2 pr-4 text-right font-medium">Recebidas</th>
                <th className="py-2 pr-4 text-right font-medium">Usadas</th>
                <th className="py-2 pr-4 text-right font-medium">Passadas</th>
                <th className="py-2 pr-4 text-right font-medium">Perdidas</th>
                <th className="py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {saldosVisiveis.map((s) => {
                const touro = tourosPorId.get(s.touro_id);
                return (
                  <tr key={s.touro_id} className="border-b border-black/[.04] last:border-0 dark:border-white/[.06]">
                    <td className="py-2 pr-4 text-black dark:text-zinc-50">{touro ? rotuloTouro(touro) : "—"}</td>
                    <td className="py-2 pr-4 text-right text-zinc-600 dark:text-zinc-400">{s.recebidas}</td>
                    <td className="py-2 pr-4 text-right text-zinc-600 dark:text-zinc-400">{s.utilizadas}</td>
                    <td className="py-2 pr-4 text-right text-zinc-600 dark:text-zinc-400">{s.transferidas}</td>
                    <td className="py-2 pr-4 text-right text-zinc-600 dark:text-zinc-400">{s.baixas}</td>
                    <td className={`py-2 text-right font-semibold ${s.saldo > 0 ? "text-brand-green" : "text-zinc-600 dark:text-zinc-400"}`}>
                      {s.saldo}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {doses.transferencias.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Passadas pra fazendas, esperando confirmação
          </span>
          {doses.transferencias.map((t) => (
            <div
              key={t.id}
              className="flex flex-col gap-1 rounded-xl border border-black/[.08] p-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[.145]"
            >
              <span className="text-black dark:text-zinc-50">
                {t.quantidade} {t.quantidade === 1 ? "dose" : "doses"} de {rotuloTouro(t.touro)} pra{" "}
                {t.propriedade?.nome_propriedade ?? "fazenda"} em {formatarDataBR(t.data_entrega)}
              </span>
              {cancelandoId === t.id ? (
                <form action={cancelarAction} className="flex gap-2">
                  <input type="hidden" name="entrega_id" value={t.id} />
                  <button
                    type="button"
                    onClick={() => setCancelandoId(null)}
                    className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
                  >
                    Voltar
                  </button>
                  <button
                    type="submit"
                    disabled={cancelando}
                    className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {cancelando ? "Cancelando..." : "Confirmar cancelamento"}
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setCancelandoId(t.id)}
                  className="self-start text-sm font-medium text-red-600 hover:underline sm:self-auto dark:text-red-400"
                >
                  Cancelar
                </button>
              )}
            </div>
          ))}
          {cancelarState?.error && <p className="text-sm text-red-600 dark:text-red-400">{cancelarState.error}</p>}
        </div>
      )}

      {doses.baixas.length > 0 && (
        <ListaBaixas baixas={doses.baixas} onSucesso={onSucesso} acao={deletarBaixaDosesTecnico} />
      )}

      {baixaAberta && (
        <BaixaModal
          touros={touros}
          saldos={comSaldo}
          acao={registrarBaixaDosesTecnico}
          onFechar={() => setBaixaAberta(false)}
          onSucesso={(msg) => {
            setBaixaAberta(false);
            onSucesso(msg);
          }}
        />
      )}

      {transferirAberta && (
        <TransferirModal
          touros={touros}
          saldos={comSaldo}
          nomeFazenda={nomeFazenda}
          onFechar={() => setTransferirAberta(false)}
          onSucesso={(msg) => {
            setTransferirAberta(false);
            onSucesso(msg);
          }}
        />
      )}
    </section>
  );
}

function TransferirModal({
  touros,
  saldos,
  nomeFazenda,
  onFechar,
  onSucesso,
}: {
  touros: Touro[];
  saldos: { touro_id: string; saldo: number }[];
  nomeFazenda: string;
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [state, action, pending] = useActionState(transferirDosesTecnico, undefined);
  const [touroId, setTouroId] = useState(saldos[0]?.touro_id ?? "");
  const tourosPorId = new Map(touros.map((t) => [t.id, t]));
  const saldo = saldos.find((s) => s.touro_id === touroId)?.saldo ?? 0;

  useEffect(() => {
    if (state?.success) queueMicrotask(() => onSucesso(`Doses passadas pra ${nomeFazenda}. A fazenda confirma o recebimento.`));
  }, [state, onSucesso, nomeFazenda]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onFechar} />
      <form
        action={action}
        className="relative flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 dark:bg-zinc-950"
      >
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Passar doses pra {nomeFazenda}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          As doses saem do seu saldo agora e entram no da fazenda quando ela confirmar o recebimento. Até lá,
          dá pra cancelar.
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor="transf_touro_id" className={LABEL_CLASSES}>
            Touro
          </label>
          <select
            id="transf_touro_id"
            name="touro_id"
            required
            value={touroId}
            onChange={(e) => setTouroId(e.target.value)}
            className={CAMPO_CLASSES}
          >
            {saldos.map((s) => {
              const touro = tourosPorId.get(s.touro_id);
              return (
                <option key={s.touro_id} value={s.touro_id}>
                  {touro ? rotuloTouro(touro) : s.touro_id} — saldo {s.saldo}
                </option>
              );
            })}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="transf_quantidade" className={LABEL_CLASSES}>
            Quantidade
          </label>
          <input
            id="transf_quantidade"
            name="quantidade"
            type="number"
            min={1}
            max={saldo}
            step={1}
            required
            defaultValue={1}
            className={CAMPO_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="transf_observacao" className={LABEL_CLASSES}>
            Observação (opcional)
          </label>
          <input id="transf_observacao" name="observacao" placeholder="Ex.: deixei no botijão da fazenda" className={CAMPO_CLASSES} />
        </div>

        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
          >
            {pending ? "Passando..." : "Passar doses"}
          </button>
        </div>
      </form>
    </div>
  );
}
