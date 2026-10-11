"use client";

import { useActionState, useEffect, useState } from "react";
import { confirmarRecebimentoDoses, registrarBaixaDoses, deletarBaixaDoses } from "./actions";
import { formatarDataBR } from "../format";
import { rotuloTouro, MOTIVOS_BAIXA } from "@/lib/programa";
import type { Touro, EntregaDoses, SaldoDoses, BaixaDoses } from "./types";
import { hojeBrasil } from "@/lib/datas";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

// Bloco "Doses do programa" no topo da aba: entregas aguardando confirmação, saldo por touro e
// baixas (doses perdidas). Só aparece pra fazenda que já recebeu (ou tem a receber) alguma
// entrega do programa.
export function DosesPrograma({
  touros,
  entregas,
  saldos,
  baixas,
  onConfirmado,
}: {
  touros: Touro[];
  entregas: EntregaDoses[];
  saldos: SaldoDoses[];
  baixas: BaixaDoses[];
  onConfirmado: (mensagem: string) => void;
}) {
  const [state, action, pending] = useActionState(confirmarRecebimentoDoses, undefined);
  const [baixaAberta, setBaixaAberta] = useState(false);

  useEffect(() => {
    if (state?.success) {
      queueMicrotask(() => onConfirmado("Recebimento confirmado!"));
    }
  }, [state, onConfirmado]);

  const pendentes = entregas.filter((e) => !e.recebido_em);
  const tourosPorId = new Map(touros.map((t) => [t.id, t]));
  const saldosVisiveis = saldos.filter(
    (s) => s.recebidas > 0 || s.a_receber > 0 || s.utilizadas > 0 || s.baixas > 0,
  );
  const comSaldo = saldosVisiveis.filter((s) => s.saldo > 0);

  if (pendentes.length === 0 && saldosVisiveis.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Doses do programa</h2>
        {comSaldo.length > 0 && (
          <button
            type="button"
            onClick={() => setBaixaAberta(true)}
            className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Registrar perda de dose
          </button>
        )}
      </div>

      {pendentes.map((entrega) => (
        <form
          key={entrega.id}
          action={action}
          className="flex flex-col gap-2 rounded-xl bg-financeiro-tint p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <input type="hidden" name="entrega_id" value={entrega.id} />
          <p className="text-base text-financeiro-ink">
            <span className="font-semibold">
              {entrega.quantidade} {entrega.quantidade === 1 ? "dose" : "doses"}
            </span>{" "}
            de {rotuloTouro(entrega.touro)} enviadas em {formatarDataBR(entrega.data_entrega)}
            {entrega.observacao ? ` — ${entrega.observacao}` : ""}
          </p>
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
          >
            {pending ? "Confirmando..." : "Confirmar recebimento"}
          </button>
        </form>
      ))}

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      {saldosVisiveis.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-base">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                <th className="py-2 pr-4 font-medium">Touro</th>
                <th className="py-2 pr-4 text-right font-medium">Recebidas</th>
                <th className="py-2 pr-4 text-right font-medium">Usadas</th>
                <th className="py-2 pr-4 text-right font-medium">Perdidas</th>
                <th className="py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {saldosVisiveis.map((s) => {
                const touro = tourosPorId.get(s.touro_id);
                return (
                  <tr key={s.touro_id} className="border-b border-black/[.04] last:border-0 dark:border-white/[.06]">
                    <td className="py-2 pr-4 text-black dark:text-zinc-50">
                      {touro ? rotuloTouro(touro) : "—"}
                    </td>
                    <td className="py-2 pr-4 text-right text-zinc-600 dark:text-zinc-400">{s.recebidas}</td>
                    <td className="py-2 pr-4 text-right text-zinc-600 dark:text-zinc-400">{s.utilizadas}</td>
                    <td className="py-2 pr-4 text-right text-zinc-600 dark:text-zinc-400">{s.baixas}</td>
                    <td
                      className={`py-2 text-right font-semibold ${
                        s.saldo > 0 ? "text-brand-green" : "text-zinc-600 dark:text-zinc-400"
                      }`}
                    >
                      {s.saldo}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {baixas.length > 0 && <ListaBaixas baixas={baixas} onSucesso={onConfirmado} />}

      {baixaAberta && (
        <BaixaModal
          touros={touros}
          saldos={comSaldo}
          onFechar={() => setBaixaAberta(false)}
          onSucesso={(msg) => {
            setBaixaAberta(false);
            onConfirmado(msg);
          }}
        />
      )}
    </section>
  );
}

function ListaBaixas({
  baixas,
  onSucesso,
}: {
  baixas: BaixaDoses[];
  onSucesso: (mensagem: string) => void;
}) {
  const [state, action, pending] = useActionState(deletarBaixaDoses, undefined);
  // exclusão em dois cliques (regra 6 do CLAUDE.md): primeiro marca, depois confirma
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  useEffect(() => {
    if (state?.success) {
      queueMicrotask(() => {
        setConfirmandoId(null);
        onSucesso("Baixa desfeita — doses devolvidas ao saldo.");
      });
    }
  }, [state, onSucesso]);

  return (
    <details className="text-base">
      <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400">
        Perdas registradas ({baixas.length})
      </summary>
      <ul className="mt-2 flex flex-col gap-2">
        {baixas.map((b) => (
          <li
            key={b.id}
            className="flex flex-col gap-1 rounded-xl border border-black/[.08] p-3 sm:flex-row sm:items-center sm:justify-between dark:border-white/[.145]"
          >
            <span className="text-black dark:text-zinc-50">
              {b.quantidade} {b.quantidade === 1 ? "dose" : "doses"} de {rotuloTouro(b.touro)} em{" "}
              {formatarDataBR(b.data_baixa)}
              <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                {MOTIVOS_BAIXA[b.motivo]}
                {b.observacao ? ` — ${b.observacao}` : ""}
              </span>
            </span>
            {confirmandoId === b.id ? (
              <form action={action} className="flex gap-2">
                <input type="hidden" name="baixa_id" value={b.id} />
                <button
                  type="button"
                  onClick={() => setConfirmandoId(null)}
                  className="text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {pending ? "Desfazendo..." : "Confirmar"}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmandoId(b.id)}
                className="self-start text-sm font-medium text-red-600 hover:underline sm:self-auto dark:text-red-400"
              >
                Desfazer
              </button>
            )}
          </li>
        ))}
      </ul>
      {state?.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </details>
  );
}

function BaixaModal({
  touros,
  saldos,
  onFechar,
  onSucesso,
}: {
  touros: Touro[];
  saldos: SaldoDoses[];
  onFechar: () => void;
  onSucesso: (mensagem: string) => void;
}) {
  const [state, action, pending] = useActionState(registrarBaixaDoses, undefined);
  const [touroId, setTouroId] = useState(saldos[0]?.touro_id ?? "");
  const tourosPorId = new Map(touros.map((t) => [t.id, t]));
  const saldo = saldos.find((s) => s.touro_id === touroId)?.saldo ?? 0;

  useEffect(() => {
    if (state?.success) queueMicrotask(() => onSucesso("Perda registrada."));
  }, [state, onSucesso]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onFechar} />
      <form
        action={action}
        className="relative flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 dark:bg-zinc-950"
      >
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Registrar perda de dose</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Para dose que saiu do botijão sem virar inseminação. Ela sai do saldo; se lançar errado,
          dá pra desfazer depois.
        </p>

        <div className="flex flex-col gap-1">
          <label htmlFor="baixa_touro_id" className={LABEL_CLASSES}>
            Touro
          </label>
          <select
            id="baixa_touro_id"
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
          <label htmlFor="baixa_quantidade" className={LABEL_CLASSES}>
            Quantidade
          </label>
          <input
            id="baixa_quantidade"
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
          <label htmlFor="baixa_motivo" className={LABEL_CLASSES}>
            Motivo
          </label>
          <select id="baixa_motivo" name="motivo" required defaultValue="perda" className={CAMPO_CLASSES}>
            {Object.entries(MOTIVOS_BAIXA).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="baixa_data" className={LABEL_CLASSES}>
            Data
          </label>
          <input
            id="baixa_data"
            name="data_baixa"
            type="date"
            required
            defaultValue={hojeBrasil()}
            className={CAMPO_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="baixa_observacao" className={LABEL_CLASSES}>
            Observação (opcional)
          </label>
          <input
            id="baixa_observacao"
            name="observacao"
            placeholder="Ex.: palheta quebrou ao descongelar"
            className={CAMPO_CLASSES}
          />
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
            className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "Salvando..." : "Registrar perda"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Campos de touro do formulário de cobertura (nova e edição): touro do catálogo, "usou dose do
// programa" e, quando nenhum touro do catálogo é escolhido, o texto livre de antes. Com touro do
// catálogo o texto livre não é enviado — o banco grava o nome do touro em touro_semen.
export function CamposTouro({
  touros,
  saldos,
  touroIdInicial = "",
  doseProgramaInicial = false,
  touroSemenInicial = "",
}: {
  touros: Touro[];
  saldos: SaldoDoses[];
  touroIdInicial?: string;
  doseProgramaInicial?: boolean;
  touroSemenInicial?: string;
}) {
  const [touroId, setTouroId] = useState(touroIdInicial);
  const [dosePrograma, setDosePrograma] = useState(doseProgramaInicial);

  const saldo = saldos.find((s) => s.touro_id === touroId)?.saldo ?? 0;
  // na edição, a dose que a própria cobertura já gastou continua disponível pra ela
  const saldoDisponivel =
    saldo + (doseProgramaInicial && touroId === touroIdInicial && touroId ? 1 : 0);
  const podeUsarDose = !!touroId && saldoDisponivel > 0;

  const opcoes = touros.filter((t) => t.ativo || t.id === touroIdInicial);

  return (
    <>
      <div className="flex flex-col gap-1">
        <label htmlFor="touro_id" className={LABEL_CLASSES}>
          Touro do catálogo
        </label>
        <select
          id="touro_id"
          name="touro_id"
          value={touroId}
          onChange={(e) => {
            setTouroId(e.target.value);
            setDosePrograma(false);
          }}
          className={CAMPO_CLASSES}
        >
          <option value="">Nenhum / outro</option>
          {opcoes.map((t) => (
            <option key={t.id} value={t.id}>
              {rotuloTouro(t)}
            </option>
          ))}
        </select>
      </div>

      {touroId ? (
        <label className="flex items-start gap-3 text-base text-black dark:text-zinc-50">
          <input
            type="checkbox"
            name="dose_programa"
            checked={dosePrograma}
            disabled={!podeUsarDose}
            onChange={(e) => setDosePrograma(e.target.checked)}
            className="mt-1 h-5 w-5 accent-brand-green"
          />
          <span>
            Usou dose do programa
            <span className="block text-sm text-zinc-600 dark:text-zinc-400">
              {podeUsarDose
                ? `Saldo desse touro: ${saldoDisponivel} ${saldoDisponivel === 1 ? "dose" : "doses"}`
                : "Sem saldo de doses desse touro."}
            </span>
          </span>
        </label>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="touro_semen" className={LABEL_CLASSES}>
            Touro/Sêmen (opcional)
          </label>
          <input
            id="touro_semen"
            name="touro_semen"
            type="text"
            defaultValue={touroSemenInicial}
            className={CAMPO_CLASSES}
          />
        </div>
      )}
    </>
  );
}
