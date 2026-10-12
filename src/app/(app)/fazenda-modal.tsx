"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Propriedade } from "@/lib/propriedade";
import type { UsuarioWhatsapp, PatrimonioItem, Acesso } from "./fazenda-types";
import {
  atualizarPropriedade,
  cadastrarPatrimonio,
  atualizarPatrimonio,
  deletarPatrimonio,
  vincularTecnico,
  desvincularTecnico,
} from "./fazenda-actions";
import { logout } from "./actions";
import { useSuccessToast, SuccessToast } from "./toast";
import { formatarTelefoneBR } from "./format";
import { CampoTelefone } from "../campo-telefone";
import { CampoLocalizacao } from "../campo-localizacao";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

// Lembretes diários pelo WhatsApp suspensos (11/10/2026): a instância é da Evolution (API não
// oficial) e disparo iniciado pelo número, pra várias fazendas no mesmo horário, arrisca bloquear a
// conta. O campo some; o resto (coluna, workflow despublicado, lembretes_do_dia) fica pronto pra
// voltar com a API oficial ou por e-mail — aí é só ligar aqui e rever bot_acao (0043).
const LEMBRETES_WHATSAPP_DISPONIVEL = false;

function SecaoHeader({ titulo, onNovo, rotuloNovo }: { titulo: string; onNovo: () => void; rotuloNovo: string }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-base font-semibold text-black dark:text-zinc-50">{titulo}</h3>
      <button
        type="button"
        onClick={onNovo}
        className="whitespace-nowrap rounded-full bg-brand-green px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
      >
        {rotuloNovo}
      </button>
    </div>
  );
}

function DadosGeraisForm({
  propriedade,
  usuarioWhatsapp,
  lembretes,
  onSuccess,
}: {
  propriedade: Propriedade;
  usuarioWhatsapp: UsuarioWhatsapp | null;
  lembretes: boolean | null;
  onSuccess: (mensagem: string) => void;
}) {
  const [state, action, pending] = useActionState(atualizarPropriedade, undefined);

  useEffect(() => {
    if (state?.success) onSuccess("Dados da propriedade salvos!");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <h3 className="text-base font-semibold text-black dark:text-zinc-50">Dados gerais</h3>

      <input type="hidden" name="whatsapp_id" value={usuarioWhatsapp?.id ?? ""} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="nome_propriedade" className={LABEL_CLASSES}>
            Nome da propriedade
          </label>
          <input
            id="nome_propriedade"
            name="nome_propriedade"
            type="text"
            required
            defaultValue={propriedade.nome_propriedade}
            className={CAMPO_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="nome_produtor" className={LABEL_CLASSES}>
            Nome do produtor
          </label>
          <input
            id="nome_produtor"
            name="nome_produtor"
            type="text"
            required
            defaultValue={propriedade.nome_produtor}
            className={CAMPO_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="municipio" className={LABEL_CLASSES}>
            Município
          </label>
          <input
            id="municipio"
            name="municipio"
            type="text"
            defaultValue={propriedade.municipio ?? ""}
            className={CAMPO_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="estado" className={LABEL_CLASSES}>
            Estado
          </label>
          <input
            id="estado"
            name="estado"
            type="text"
            defaultValue={propriedade.estado ?? ""}
            className={CAMPO_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="tecnico_responsavel" className={LABEL_CLASSES}>
            Técnico responsável
          </label>
          <input
            id="tecnico_responsavel"
            name="tecnico_responsavel"
            type="text"
            defaultValue={propriedade.tecnico_responsavel ?? ""}
            className={CAMPO_CLASSES}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="whatsapp_telefone" className={LABEL_CLASSES}>
            WhatsApp
          </label>
          <CampoTelefone
            id="whatsapp_telefone"
            name="whatsapp_telefone"
            defaultValue={usuarioWhatsapp ? formatarTelefoneBR(usuarioWhatsapp.telefone) : ""}
            className={CAMPO_CLASSES}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className={LABEL_CLASSES}>Localização da fazenda</span>
        <CampoLocalizacao
          latitudeInicial={propriedade.latitude}
          longitudeInicial={propriedade.longitude}
          classeCampo={CAMPO_CLASSES}
          mostrarCampos
        />
      </div>

      {LEMBRETES_WHATSAPP_DISPONIVEL && lembretes !== null && (
        <label className="flex items-start gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
          <input type="hidden" name="lembretes_presente" value="1" />
          <input
            type="checkbox"
            name="lembretes_whatsapp"
            defaultChecked={lembretes}
            className="mt-1 h-5 w-5 accent-brand-green"
          />
          <span className="flex flex-col gap-0.5">
            <span className="text-base font-medium text-black dark:text-zinc-50">Lembretes diários no WhatsApp</span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Às 6h, só nos dias com pendência: vacas pra secar, diagnóstico de prenhez a fazer, partos
              previstos e dias sem lançar leite. Vai pro WhatsApp acima.
            </span>
          </span>
        </label>
      )}

      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Latitude/longitude posicionam a fazenda no mapa do gestor. Pra pegar as coordenadas, abra o
        local no Google Maps e copie os dois números que aparecem ao clicar com o botão direito.
      </p>

      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
      >
        {pending ? "Salvando..." : "Salvar"}
      </button>
    </form>
  );
}

function formatarMoeda(valor: number | null) {
  if (valor === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

function PatrimonioSecao({
  itens,
  onSuccess,
}: {
  itens: PatrimonioItem[];
  onSuccess: (mensagem: string) => void;
}) {
  const [drawerAberto, setDrawerAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<PatrimonioItem | null>(null);
  const [paraExcluir, setParaExcluir] = useState<PatrimonioItem | null>(null);

  const [criarState, criarAction] = useActionState(cadastrarPatrimonio, undefined);
  const [editarState, editarAction] = useActionState(atualizarPatrimonio, undefined);
  const [excluirState, excluirAction] = useActionState(deletarPatrimonio, undefined);

  useEffect(() => {
    if (criarState?.success) {
      queueMicrotask(() => {
        setDrawerAberto(false);
        onSuccess("Item de patrimônio cadastrado!");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [criarState]);
  useEffect(() => {
    if (editarState?.success) {
      queueMicrotask(() => {
        setEmEdicao(null);
        onSuccess("Item de patrimônio atualizado!");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarState]);
  useEffect(() => {
    if (excluirState?.success) {
      queueMicrotask(() => {
        setParaExcluir(null);
        onSuccess("Item de patrimônio excluído!");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [excluirState]);

  return (
    <div className="flex flex-col gap-2">
      <SecaoHeader titulo="Patrimônio" onNovo={() => setDrawerAberto(true)} rotuloNovo="+ Novo item" />

      <div className="overflow-x-auto rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]">
        <table className="w-full min-w-[480px] text-left text-base">
          <thead>
            <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
              <th className="px-3 py-2 font-medium">Ativo</th>
              <th className="px-3 py-2 font-medium">Valor total</th>
              <th className="px-3 py-2 font-medium">Taxa de juros</th>
              <th className="px-3 py-2 font-medium">Vida útil (anos)</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((p, i) => (
              <tr
                key={p.id}
                onClick={() => setEmEdicao(p)}
                className={`cursor-pointer hover:bg-black/[.04] dark:hover:bg-white/[.06] ${
                  i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                }`}
              >
                <td className="px-3 py-2 text-black dark:text-zinc-50">{p.tipo_ativo ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{formatarMoeda(p.valor_total)}</td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                  {p.taxa_juros !== null
                    ? `${Number(p.taxa_juros).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`
                    : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">{p.vida_util ?? "—"}</td>
              </tr>
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-zinc-600 dark:text-zinc-400">
                  Nenhum item cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {drawerAberto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerAberto(false)} />
          <form
            action={criarAction}
            className="relative flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <h4 className="text-base font-semibold text-black dark:text-zinc-50">Novo item de patrimônio</h4>
            <div className="flex flex-col gap-1">
              <label htmlFor="p_tipo_ativo" className={LABEL_CLASSES}>
                Ativo
              </label>
              <input id="p_tipo_ativo" name="tipo_ativo" type="text" placeholder="trator, ordenhadeira..." className={CAMPO_CLASSES} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="p_valor_total" className={LABEL_CLASSES}>
                Valor total (R$)
              </label>
              <input id="p_valor_total" name="valor_total" type="number" step="0.01" min="0" className={CAMPO_CLASSES} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="p_taxa_juros" className={LABEL_CLASSES}>
                Taxa de juros (%)
              </label>
              <input id="p_taxa_juros" name="taxa_juros" type="number" step="0.01" className={CAMPO_CLASSES} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="p_vida_util" className={LABEL_CLASSES}>
                Vida útil (anos)
              </label>
              <input id="p_vida_util" name="vida_util" type="number" step="1" min="0" className={CAMPO_CLASSES} />
            </div>

            {criarState?.error && <p className="text-sm text-red-600 dark:text-red-400">{criarState.error}</p>}

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => setDrawerAberto(false)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
              >
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {emEdicao && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEmEdicao(null)} />
          <form
            key={emEdicao.id}
            action={editarAction}
            className="relative flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="id" value={emEdicao.id} />
            <h4 className="text-base font-semibold text-black dark:text-zinc-50">Editar item de patrimônio</h4>
            <div className="flex flex-col gap-1">
              <label htmlFor="ep_tipo_ativo" className={LABEL_CLASSES}>
                Ativo
              </label>
              <input
                id="ep_tipo_ativo"
                name="tipo_ativo"
                type="text"
                defaultValue={emEdicao.tipo_ativo ?? ""}
                className={CAMPO_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ep_valor_total" className={LABEL_CLASSES}>
                Valor total (R$)
              </label>
              <input
                id="ep_valor_total"
                name="valor_total"
                type="number"
                step="0.01"
                min="0"
                defaultValue={emEdicao.valor_total ?? undefined}
                className={CAMPO_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ep_taxa_juros" className={LABEL_CLASSES}>
                Taxa de juros (%)
              </label>
              <input
                id="ep_taxa_juros"
                name="taxa_juros"
                type="number"
                step="0.01"
                defaultValue={emEdicao.taxa_juros ?? undefined}
                className={CAMPO_CLASSES}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="ep_vida_util" className={LABEL_CLASSES}>
                Vida útil (anos)
              </label>
              <input
                id="ep_vida_util"
                name="vida_util"
                type="number"
                step="1"
                min="0"
                defaultValue={emEdicao.vida_util ?? undefined}
                className={CAMPO_CLASSES}
              />
            </div>

            {editarState?.error && <p className="text-sm text-red-600 dark:text-red-400">{editarState.error}</p>}

            <div className="mt-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setParaExcluir(emEdicao);
                  setEmEdicao(null);
                }}
                className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                Excluir
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEmEdicao(null)}
                  className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
                >
                  Salvar
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {paraExcluir && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setParaExcluir(null)} />
          <form
            action={excluirAction}
            className="relative flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="id" value={paraExcluir.id} />
            <h4 className="text-base font-semibold text-black dark:text-zinc-50">Excluir item?</h4>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {paraExcluir.tipo_ativo ?? "Item sem nome"}. Essa ação não pode ser desfeita.
            </p>
            {excluirState?.error && <p className="text-sm text-red-600 dark:text-red-400">{excluirState.error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setParaExcluir(null)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
              >
                Excluir
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const PAPEL_LABEL: Record<string, string> = {
  produtor: "Produtor",
  tecnico: "Técnico",
};

function AcessosSecao({
  acessos,
  podeGerenciar,
  onChange,
  onSuccess,
}: {
  acessos: Acesso[];
  podeGerenciar: boolean;
  onChange: (acessos: Acesso[]) => void;
  onSuccess: (mensagem: string) => void;
}) {
  const [paraRemover, setParaRemover] = useState<Acesso | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [vincularState, vincularAction, vincularPending] = useActionState(vincularTecnico, undefined);
  const [removerState, removerAction, removerPending] = useActionState(desvincularTecnico, undefined);

  useEffect(() => {
    if (vincularState?.success && vincularState.acessos) {
      const novos = vincularState.acessos;
      queueMicrotask(() => {
        onChange(novos);
        formRef.current?.reset();
        onSuccess("Acesso liberado!");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vincularState]);
  useEffect(() => {
    if (removerState?.success && removerState.acessos) {
      const novos = removerState.acessos;
      queueMicrotask(() => {
        onChange(novos);
        setParaRemover(null);
        onSuccess("Acesso removido!");
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [removerState]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-base font-semibold text-black dark:text-zinc-50">Acessos</h3>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Quem entra no site com acesso a esta fazenda. Técnicos veem e lançam dados como o produtor.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-black/[.08] rounded-2xl border border-black/[.08] bg-surface dark:divide-white/[.145] dark:border-white/[.145]">
        {acessos.map((a) => (
          <li key={a.usuario_id} className="flex items-center justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-black dark:text-zinc-50">{a.nome ?? a.email}</span>
              {a.nome && (
                <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">{a.email}</span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="rounded-full bg-zinc-500/10 px-2 py-0.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
                {PAPEL_LABEL[a.papel] ?? a.papel}
              </span>
              {podeGerenciar && a.papel === "tecnico" && (
                <button
                  type="button"
                  onClick={() => setParaRemover(a)}
                  className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Remover
                </button>
              )}
            </div>
          </li>
        ))}
        {acessos.length === 0 && (
          <li className="px-3 py-4 text-center text-zinc-600 dark:text-zinc-400">
            Nenhuma conta do site vinculada.
          </li>
        )}
      </ul>

      {podeGerenciar ? (
        <form ref={formRef} action={vincularAction} className="flex flex-col gap-2">
          <label htmlFor="acesso_email" className={LABEL_CLASSES}>
            Dar acesso a um técnico
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="acesso_email"
              name="email"
              type="email"
              required
              placeholder="e-mail da conta do técnico"
              className={`min-w-0 flex-1 ${CAMPO_CLASSES}`}
            />
            <button
              type="submit"
              disabled={vincularPending}
              className="whitespace-nowrap rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
            >
              {vincularPending ? "Liberando..." : "Dar acesso"}
            </button>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            O técnico precisa ter criado a conta antes (tela de login → Cadastre-se → Sou técnico).
          </p>
          {vincularState?.error && (
            <p className="text-sm text-red-600 dark:text-red-400">{vincularState.error}</p>
          )}
        </form>
      ) : (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Só o produtor da fazenda ou o gestor do programa pode alterar os acessos.
        </p>
      )}

      {paraRemover && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setParaRemover(null)} />
          <form
            action={removerAction}
            className="relative flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-white p-6 dark:bg-zinc-950"
          >
            <input type="hidden" name="usuario_id" value={paraRemover.usuario_id} />
            <h4 className="text-base font-semibold text-black dark:text-zinc-50">Remover acesso?</h4>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {paraRemover.nome ?? paraRemover.email} deixa de ver e lançar dados desta fazenda. Os
              registros que ele já fez continuam.
            </p>
            {removerState?.error && (
              <p className="text-sm text-red-600 dark:text-red-400">{removerState.error}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setParaRemover(null)}
                className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={removerPending}
                className="flex-1 rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Remover
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

export function FazendaModal({
  propriedade,
  usuarioWhatsapp,
  patrimonios,
  acessos,
  podeGerenciarAcessos,
  lembretes,
  onAcessosChange,
  onClose,
}: {
  propriedade: Propriedade;
  usuarioWhatsapp: UsuarioWhatsapp | null;
  patrimonios: PatrimonioItem[];
  acessos: Acesso[];
  podeGerenciarAcessos: boolean;
  lembretes: boolean | null;
  onAcessosChange: (acessos: Acesso[]) => void;
  onClose: () => void;
}) {
  const { mensagemToast, mostrarToast } = useSuccessToast();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <SuccessToast mensagem={mensagemToast} />

      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col gap-6 overflow-y-auto rounded-2xl bg-white p-6 dark:bg-zinc-950">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">{propriedade.nome_propriedade}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Fechar
          </button>
        </div>

        <DadosGeraisForm
          propriedade={propriedade}
          usuarioWhatsapp={usuarioWhatsapp}
          lembretes={lembretes}
          onSuccess={mostrarToast}
        />
        <PatrimonioSecao itens={patrimonios} onSuccess={mostrarToast} />
        <AcessosSecao
          acessos={acessos}
          podeGerenciar={podeGerenciarAcessos}
          onChange={onAcessosChange}
          onSuccess={mostrarToast}
        />

        <form action={logout} className="border-t border-black/[.08] pt-4 dark:border-white/[.145]">
          <button
            type="submit"
            className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
