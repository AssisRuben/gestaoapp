"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { registrarVisita, concluirRecomendacao, excluirVisita } from "./actions";
import { useSuccessToast, SuccessToast } from "../toast";
import { formatarDataBR } from "../format";
import { hojeBrasil } from "@/lib/datas";
import type { VisitaResumo } from "@/lib/resumo-fazenda";

const CAMPO =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const ROTULO = "text-base font-medium text-black dark:text-zinc-50";

function Recomendacao({ r, onErro }: { r: VisitaResumo["recomendacoes"][number]; onErro: (m: string) => void }) {
  const [pendente, startTransition] = useTransition();
  const feita = !!r.concluidaEm;
  return (
    <li className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={feita}
        disabled={pendente}
        aria-label={feita ? `Reabrir: ${r.texto}` : `Marcar como feita: ${r.texto}`}
        onChange={(e) => {
          const marcar = e.target.checked;
          startTransition(async () => {
            const res = await concluirRecomendacao(r.id, marcar);
            if (res.error) onErro(res.error);
          });
        }}
        className="mt-1 h-4 w-4 accent-brand-green"
      />
      <span className={feita ? "text-zinc-500 line-through" : "text-black dark:text-zinc-50"}>
        {r.texto}
        {r.prazo && !feita && <span className="text-zinc-600 dark:text-zinc-400"> (prazo {formatarDataBR(r.prazo)})</span>}
        {feita && (
          <span className="no-underline text-xs text-zinc-500">
            {" "}
            feita em {formatarDataBR(r.concluidaEm!)}
            {r.concluidaPorNome && ` por ${r.concluidaPorNome}`}
          </span>
        )}
      </span>
    </li>
  );
}

export function VisitasPainel({ visitas, usuarioId }: { visitas: VisitaResumo[]; usuarioId: string | null }) {
  const [state, action, pending] = useActionState(registrarVisita, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [excluindo, startExcluir] = useTransition();
  const [paraExcluir, setParaExcluir] = useState<string | null>(null);
  const { mensagemToast, mostrarToast } = useSuccessToast();

  useEffect(() => {
    if (state?.success) {
      queueMicrotask(() => {
        formRef.current?.reset();
        mostrarToast("Visita registrada!");
      });
    }
  }, [state, mostrarToast]);

  return (
    <section className="flex flex-col gap-4 print:hidden">
      <SuccessToast mensagem={mensagemToast} />

      <form
        ref={formRef}
        action={action}
        className="flex flex-col gap-3 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]"
      >
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Registrar visita técnica</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="data_visita" className={ROTULO}>
              Data da visita
            </label>
            <input id="data_visita" name="data_visita" type="date" required max={hojeBrasil()} defaultValue={hojeBrasil()} className={CAMPO} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="prazo" className={ROTULO}>
              Prazo das recomendações (opcional)
            </label>
            <input id="prazo" name="prazo" type="date" className={CAMPO} />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="observacoes" className={ROTULO}>
            O que foi visto
          </label>
          <textarea
            id="observacoes"
            name="observacoes"
            rows={4}
            placeholder="Condição do pasto, do rebanho, da ordenha, do controle..."
            className={CAMPO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="recomendacoes" className={ROTULO}>
            Recomendações (uma por linha)
          </label>
          <textarea
            id="recomendacoes"
            name="recomendacoes"
            rows={4}
            placeholder={"Fazer diagnóstico da vaca 12\nTrocar o sal mineral\nPesar o leite toda semana"}
            className={CAMPO}
          />
        </div>
        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="self-start rounded-full bg-brand-green px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
        >
          {pending ? "Salvando..." : "Registrar visita"}
        </button>
      </form>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

      {visitas.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Visitas anteriores</h2>
          {visitas.map((v) => (
            <article key={v.id} className="flex flex-col gap-2 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-black dark:text-zinc-50">
                  {formatarDataBR(v.data)}
                  {v.autorNome && <span className="font-normal text-zinc-600 dark:text-zinc-400"> · {v.autorNome}</span>}
                </p>
                {usuarioId && v.autorId === usuarioId && (
                  paraExcluir === v.id ? (
                    <span className="flex items-center gap-2 text-sm">
                      <button type="button" onClick={() => setParaExcluir(null)} className="text-zinc-600 hover:underline dark:text-zinc-400">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={excluindo}
                        onClick={() =>
                          startExcluir(async () => {
                            const res = await excluirVisita(v.id);
                            if (res.error) setErro(res.error);
                            else mostrarToast("Visita excluída");
                            setParaExcluir(null);
                          })
                        }
                        className="rounded-full bg-red-600 px-3 py-1 font-medium text-white disabled:opacity-50"
                      >
                        Confirmar exclusão
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setParaExcluir(v.id)}
                      className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      Excluir
                    </button>
                  )
                )}
              </div>
              {v.observacoes && <p className="whitespace-pre-line text-sm text-black dark:text-zinc-50">{v.observacoes}</p>}
              {v.recomendacoes.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {v.recomendacoes.map((r) => (
                    <Recomendacao key={r.id} r={r} onErro={setErro} />
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
