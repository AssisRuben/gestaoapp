"use client";

import { useActionState, useEffect, useState } from "react";
import { registrarDosesEntidade, excluirDosesEntidade, salvarKit, excluirKit, cederKit, devolverKit } from "./actions";
import { Modal, Campo, CAMPO_CLASSES, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BotaoExcluir } from "../programa/ui";
import { formatarDataBR } from "../../(app)/format";
import { hojeBrasil } from "@/lib/datas";
import { rotuloTouro, type Touro, type TecnicoPrograma } from "@/lib/programa";

// Kits e doses da entidade (0068). O kit é da entidade (doação, um patrimônio por kit) e vai pra uma
// fazenda ou um técnico como cessão de uso. As doses que a entidade recebe formam um saldo; a entrega
// pra fazenda/técnico (aba Programa) sai dele.

export type KitEntidade = {
  id: string;
  entidade_id: string;
  patrimonio: string;
  processo: string | null;
  propriedade_id: string | null;
  tecnico_id: string | null;
  cedido_em: string | null;
  observacao: string | null;
};

export type DosesRecebidasEntidade = {
  id: string;
  entidade_id: string;
  touro_id: string;
  quantidade: number;
  data_entrega: string;
  observacao: string | null;
};

export type SaldoEntidade = {
  entidade_id: string;
  touro_id: string;
  recebidas: number;
  repassadas: number;
  saldo: number;
};

export type OpcoesKitsDoses = {
  touros: Touro[];
  propriedades: { id: string; nome_propriedade: string }[];
  tecnicos: TecnicoPrograma[];
};

const SUBTITULO = "text-base font-semibold text-black dark:text-zinc-50";
const TEXTO_FRACO = "text-sm text-zinc-600 dark:text-zinc-400";
const LINK = "text-sm font-medium text-brand-green hover:underline";

function nomeTouro(touros: Touro[], id: string) {
  const t = touros.find((x) => x.id === id);
  return t ? rotuloTouro(t) : "Touro";
}

export function comQuem(kit: KitEntidade, opcoes: OpcoesKitsDoses) {
  if (kit.propriedade_id) {
    return opcoes.propriedades.find((p) => p.id === kit.propriedade_id)?.nome_propriedade ?? "Fazenda";
  }
  if (kit.tecnico_id) {
    const t = opcoes.tecnicos.find((x) => x.usuario_id === kit.tecnico_id);
    return `Técnico: ${t ? (t.nome ?? t.email) : "sem acesso ao programa"}`;
  }
  return null;
}

export function ResumoKitsDoses({ kits, saldos, touros }: { kits: KitEntidade[]; saldos: SaldoEntidade[]; touros: Touro[] }) {
  const cedidos = kits.filter((k) => k.propriedade_id || k.tecnico_id).length;
  const comSaldo = saldos.filter((s) => s.saldo > 0);
  const totalSaldo = comSaldo.reduce((t, s) => t + s.saldo, 0);
  return (
    <p className={TEXTO_FRACO}>
      {kits.length
        ? `${kits.length} ${kits.length === 1 ? "kit" : "kits"} de inseminação · ${cedidos} em cessão de uso · ${kits.length - cedidos} na entidade`
        : "Nenhum kit cadastrado"}
      {" · "}
      {comSaldo.length
        ? `${totalSaldo} ${totalSaldo === 1 ? "dose" : "doses"} na entidade (${comSaldo
            .map((s) => `${nomeTouro(touros, s.touro_id)} ${s.saldo}`)
            .join(", ")})`
        : "sem doses na entidade"}
    </p>
  );
}

export function KitsDosesEntidade({
  entidadeId,
  kits,
  recebidas,
  saldos,
  opcoes,
  onSucesso,
}: {
  entidadeId: string;
  kits: KitEntidade[];
  recebidas: DosesRecebidasEntidade[];
  saldos: SaldoEntidade[];
  opcoes: OpcoesKitsDoses;
  onSucesso: (mensagem: string) => void;
}) {
  const [modal, setModal] = useState<"doses" | "kit" | KitEntidade | null>(null);
  const fechar = (mensagem: string) => {
    setModal(null);
    onSucesso(mensagem);
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={SUBTITULO}>Doses da entidade</h3>
          <button type="button" onClick={() => setModal("doses")} className={LINK}>
            + Doses recebidas
          </button>
        </div>
        {saldos.length === 0 ? (
          <p className={TEXTO_FRACO}>
            Nenhuma dose registrada. As entregas pra fazendas e técnicos (aba Programa) saem do saldo da entidade.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                  <th className="px-2 py-1.5 font-medium">Touro</th>
                  <th className="px-2 py-1.5 text-right font-medium">Recebidas</th>
                  <th className="px-2 py-1.5 text-right font-medium">Repassadas</th>
                  <th className="px-2 py-1.5 text-right font-medium">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {saldos.map((s) => (
                  <tr key={s.touro_id} className="border-b border-black/[.04] dark:border-white/[.06]">
                    <td className="px-2 py-1.5">{nomeTouro(opcoes.touros, s.touro_id)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.recebidas}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{s.repassadas}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${s.saldo < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                      {s.saldo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {recebidas.length > 0 && (
          <ul className="flex flex-col gap-1">
            {recebidas.map((r) => (
              <LinhaDosesRecebidas key={r.id} r={r} touros={opcoes.touros} onSucesso={onSucesso} />
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className={SUBTITULO}>Kits de inseminação</h3>
          <button type="button" onClick={() => setModal("kit")} className={LINK}>
            + Kit
          </button>
        </div>
        {kits.length === 0 ? (
          <p className={TEXTO_FRACO}>Nenhum kit cadastrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                  <th className="px-2 py-1.5 font-medium">Patrimônio</th>
                  <th className="px-2 py-1.5 font-medium">Processo</th>
                  <th className="px-2 py-1.5 font-medium">Com quem</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {kits.map((k) => {
                  const quem = comQuem(k, opcoes);
                  return (
                    <tr key={k.id} className="border-b border-black/[.04] dark:border-white/[.06]">
                      <td className="px-2 py-1.5 font-mono tabular-nums">{k.patrimonio}</td>
                      <td className="px-2 py-1.5 tabular-nums">{k.processo ?? "—"}</td>
                      <td className="px-2 py-1.5">
                        {quem ? (
                          <>
                            {quem}
                            {k.cedido_em && <span className={TEXTO_FRACO}> · desde {formatarDataBR(k.cedido_em)}</span>}
                          </>
                        ) : (
                          <span className={TEXTO_FRACO}>Na entidade</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <button type="button" onClick={() => setModal(k)} className={LINK}>
                          {quem ? "Alterar" : "Ceder"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modal === "doses" && (
        <DosesModal entidadeId={entidadeId} touros={opcoes.touros} onFechar={() => setModal(null)} onSalvo={() => fechar("Doses registradas!")} />
      )}
      {modal === "kit" && (
        <NovoKitModal entidadeId={entidadeId} onFechar={() => setModal(null)} onSalvo={() => fechar("Kit cadastrado!")} />
      )}
      {modal && typeof modal === "object" && (
        <CessaoModal kit={modal} opcoes={opcoes} onFechar={() => setModal(null)} onSalvo={fechar} />
      )}
    </div>
  );
}

function LinhaDosesRecebidas({
  r,
  touros,
  onSucesso,
}: {
  r: DosesRecebidasEntidade;
  touros: Touro[];
  onSucesso: (mensagem: string) => void;
}) {
  const [state, action, pending] = useActionState(excluirDosesEntidade, undefined);
  useEffect(() => {
    if (state?.success) queueMicrotask(() => onSucesso("Registro de doses excluído!"));
  }, [state, onSucesso]);

  return (
    <li className="flex flex-col gap-1 text-sm">
      <form className="flex flex-wrap items-center justify-between gap-2">
        <input type="hidden" name="id" value={r.id} />
        <span>
          {formatarDataBR(r.data_entrega)} · {nomeTouro(touros, r.touro_id)} · {r.quantidade}{" "}
          {r.quantidade === 1 ? "dose recebida" : "doses recebidas"}
          {r.observacao && <span className={TEXTO_FRACO}> · {r.observacao}</span>}
        </span>
        <BotaoExcluir acao={action} excluindo={pending} />
      </form>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </li>
  );
}

function DosesModal({
  entidadeId,
  touros,
  onFechar,
  onSalvo,
}: {
  entidadeId: string;
  touros: Touro[];
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [state, action, pending] = useActionState(registrarDosesEntidade, undefined);
  useEffect(() => {
    if (state?.success) queueMicrotask(onSalvo);
  }, [state, onSalvo]);

  return (
    <Modal onFechar={onFechar}>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="entidade_id" value={entidadeId} />
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Doses recebidas pela entidade</h2>
        <p className={TEXTO_FRACO}>Entram no saldo da entidade. A entrega pra fazenda ou técnico (aba Programa) sai desse saldo.</p>
        <Campo id="doses_touro" label="Touro">
          <select id="doses_touro" name="touro_id" required defaultValue="" className={CAMPO_CLASSES}>
            <option value="" disabled>
              Selecione
            </option>
            {touros
              .filter((t) => t.ativo)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {rotuloTouro(t)}
                </option>
              ))}
          </select>
        </Campo>
        <Campo id="doses_quantidade" label="Quantidade de doses">
          <input id="doses_quantidade" name="quantidade" type="number" min={1} step={1} required className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="doses_data" label="Data">
          <input id="doses_data" name="data_entrega" type="date" required defaultValue={hojeBrasil()} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="doses_obs" label="Observação (opcional)">
          <input id="doses_obs" name="observacao" className={CAMPO_CLASSES} />
        </Campo>
        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={pending} className={BOTAO_PRIMARIO}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NovoKitModal({ entidadeId, onFechar, onSalvo }: { entidadeId: string; onFechar: () => void; onSalvo: () => void }) {
  const [state, action, pending] = useActionState(salvarKit, undefined);
  useEffect(() => {
    if (state?.success) queueMicrotask(onSalvo);
  }, [state, onSalvo]);

  return (
    <Modal onFechar={onFechar}>
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="entidade_id" value={entidadeId} />
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Novo kit de inseminação</h2>
        <Campo id="kit_patrimonio" label="Número de patrimônio">
          <input id="kit_patrimonio" name="patrimonio" required placeholder="426.000-0" className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="kit_processo" label="Processo de doação (opcional)">
          <input id="kit_processo" name="processo" placeholder="59511.000000/2026-00" className={CAMPO_CLASSES} />
        </Campo>
        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" disabled={pending} className={BOTAO_PRIMARIO}>
            {pending ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CessaoModal({
  kit,
  opcoes,
  onFechar,
  onSalvo,
}: {
  kit: KitEntidade;
  opcoes: OpcoesKitsDoses;
  onFechar: () => void;
  onSalvo: (mensagem: string) => void;
}) {
  const [cederState, cederAction, cedendo] = useActionState(cederKit, undefined);
  const [devolverState, devolverAction, devolvendo] = useActionState(devolverKit, undefined);
  const [excluirState, excluirAction, excluindo] = useActionState(excluirKit, undefined);
  const [destino, setDestino] = useState<"fazenda" | "tecnico">(kit.tecnico_id ? "tecnico" : "fazenda");
  const cedido = !!(kit.propriedade_id || kit.tecnico_id);

  useEffect(() => {
    if (cederState?.success) queueMicrotask(() => onSalvo("Cessão do kit salva!"));
  }, [cederState, onSalvo]);
  useEffect(() => {
    if (devolverState?.success) queueMicrotask(() => onSalvo("Kit de volta à entidade!"));
  }, [devolverState, onSalvo]);
  useEffect(() => {
    if (excluirState?.success) queueMicrotask(() => onSalvo("Kit excluído!"));
  }, [excluirState, onSalvo]);

  const erro = cederState?.error ?? devolverState?.error ?? excluirState?.error;

  return (
    <Modal onFechar={onFechar}>
      <form action={cederAction} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={kit.id} />
        <input type="hidden" name="destino" value={destino} />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Kit {kit.patrimonio}</h2>
          <p className={TEXTO_FRACO}>
            Cessão de uso: o kit continua da entidade.{kit.processo ? ` Processo ${kit.processo}.` : ""}
          </p>
        </div>

        <div role="radiogroup" aria-label="Com quem fica o kit" className="grid grid-cols-2 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[.08]">
          {(
            [
              ["fazenda", "Uma fazenda"],
              ["tecnico", "Um técnico"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={destino === valor}
              onClick={() => setDestino(valor)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                destino === valor
                  ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {destino === "tecnico" ? (
          <Campo id="kit_tecnico" label="Técnico">
            <select id="kit_tecnico" name="tecnico_id" required defaultValue={kit.tecnico_id ?? ""} className={CAMPO_CLASSES}>
              <option value="" disabled>
                Selecione
              </option>
              {opcoes.tecnicos.map((t) => (
                <option key={t.usuario_id} value={t.usuario_id}>
                  {t.nome ? `${t.nome} (${t.email})` : t.email}
                </option>
              ))}
            </select>
          </Campo>
        ) : (
          <Campo id="kit_fazenda" label="Fazenda">
            <select id="kit_fazenda" name="propriedade_id" required defaultValue={kit.propriedade_id ?? ""} className={CAMPO_CLASSES}>
              <option value="" disabled>
                Selecione
              </option>
              {opcoes.propriedades.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome_propriedade}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo id="kit_cedido_em" label="Data da cessão">
          <input id="kit_cedido_em" name="cedido_em" type="date" required defaultValue={kit.cedido_em ?? hojeBrasil()} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="kit_obs" label="Observação (opcional)">
          <input id="kit_obs" name="observacao" defaultValue={kit.observacao ?? ""} className={CAMPO_CLASSES} />
        </Campo>

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {cedido ? (
            <button
              type="submit"
              formAction={devolverAction}
              formNoValidate
              disabled={devolvendo}
              className="text-sm font-medium text-brand-green hover:underline disabled:opacity-50"
            >
              {devolvendo ? "Devolvendo..." : "Devolver à entidade"}
            </button>
          ) : (
            <BotaoExcluir acao={excluirAction} excluindo={excluindo} />
          )}
          <div className="flex gap-2">
            <button type="button" onClick={onFechar} className={BOTAO_SECUNDARIO}>
              Cancelar
            </button>
            <button type="submit" disabled={cedendo} className={BOTAO_PRIMARIO}>
              {cedendo ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
