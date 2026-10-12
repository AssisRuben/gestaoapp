"use client";

import { useActionState, useState } from "react";
import { cadastrarNovaFazenda, cadastrarSemFazenda } from "./cadastro-actions";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

type TipoCadastro = "produtor" | "tecnico";

function CamposAcesso() {
  return (
    <>
      <h3 className="text-base font-semibold text-black dark:text-zinc-50">Acesso</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="email" className={LABEL_CLASSES}>
            E-mail
          </label>
          <input id="email" name="email" type="email" required autoComplete="email" className={CAMPO_CLASSES} />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className={LABEL_CLASSES}>
            Senha
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className={CAMPO_CLASSES}
          />
        </div>
      </div>
    </>
  );
}

function Botoes({ onClose, pending }: { onClose: () => void; pending: boolean }) {
  return (
    <div className="mt-2 flex gap-2">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        Cancelar
      </button>
      <button
        type="submit"
        disabled={pending}
        className="flex-1 rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
      >
        {pending ? "Cadastrando..." : "Cadastrar"}
      </button>
    </div>
  );
}

export function CadastroModal({ onClose }: { onClose: () => void }) {
  const [tipo, setTipo] = useState<TipoCadastro>("produtor");
  // produtor cuja fazenda já usa o bot: conta SEM fazenda nova; o gestor liga à fazenda existente
  const [jaUsaWhatsapp, setJaUsaWhatsapp] = useState(false);
  const [fazendaState, fazendaAction, fazendaPending] = useActionState(cadastrarNovaFazenda, undefined);
  const [semFazendaState, semFazendaAction, semFazendaPending] = useActionState(cadastrarSemFazenda, undefined);

  const semFazenda = tipo === "tecnico" || jaUsaWhatsapp;
  const state = semFazenda ? semFazendaState : fazendaState;

  if (state?.success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/30" onClick={onClose} />
        <div className="relative flex w-full max-w-sm flex-col gap-3 rounded-lg bg-white p-6 text-center dark:bg-zinc-950">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Cadastro realizado!</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Confira seu e-mail e clique no link de confirmação pra ativar sua conta e poder entrar.
          </p>
          {tipo === "tecnico" && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Depois, peça ao produtor de cada fazenda (ou ao gestor do programa) pra liberar seu
              acesso usando este e-mail.
            </p>
          )}
          {tipo === "produtor" && jaUsaWhatsapp && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Depois, mande este e-mail pro gestor do programa: ele liga a sua conta à fazenda que já
              usa o WhatsApp, com todos os dados que você já lançou.
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 self-center rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
          >
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form
        key={`${tipo}-${jaUsaWhatsapp}`}
        action={semFazenda ? semFazendaAction : fazendaAction}
        className="relative flex max-h-[90vh] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-lg bg-white p-6 dark:bg-zinc-950"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-black dark:text-zinc-50">Criar conta</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Fechar
          </button>
        </div>

        <div role="radiogroup" aria-label="Tipo de conta" className="grid grid-cols-2 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[.08]">
          {(
            [
              ["produtor", "Sou produtor"],
              ["tecnico", "Sou técnico"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={tipo === valor}
              onClick={() => setTipo(valor)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                tipo === valor
                  ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {tipo === "produtor" && (
          <label className="flex items-start gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
            <input
              type="checkbox"
              checked={jaUsaWhatsapp}
              onChange={(e) => setJaUsaWhatsapp(e.target.checked)}
              className="mt-1 h-5 w-5 accent-brand-green"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-base font-medium text-black dark:text-zinc-50">
                Minha fazenda já usa o Gestão Pec pelo WhatsApp
              </span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                Marque se você já manda os dados pro bot. Assim a conta é ligada à sua fazenda, sem criar
                outra vazia.
              </span>
            </span>
          </label>
        )}

        {tipo === "produtor" && !jaUsaWhatsapp ? (
          <>
            <h3 className="text-base font-semibold text-black dark:text-zinc-50">Dados da fazenda</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="nome_propriedade" className={LABEL_CLASSES}>
                  Nome da propriedade
                </label>
                <input id="nome_propriedade" name="nome_propriedade" type="text" required className={CAMPO_CLASSES} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="nome_produtor" className={LABEL_CLASSES}>
                  Nome do produtor
                </label>
                <input id="nome_produtor" name="nome_produtor" type="text" required className={CAMPO_CLASSES} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="municipio" className={LABEL_CLASSES}>
                  Município
                </label>
                <input id="municipio" name="municipio" type="text" className={CAMPO_CLASSES} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="estado" className={LABEL_CLASSES}>
                  Estado
                </label>
                <input id="estado" name="estado" type="text" className={CAMPO_CLASSES} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="tecnico_responsavel" className={LABEL_CLASSES}>
                  Técnico responsável
                </label>
                <input id="tecnico_responsavel" name="tecnico_responsavel" type="text" className={CAMPO_CLASSES} />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="whatsapp" className={LABEL_CLASSES}>
                  WhatsApp
                </label>
                <input
                  id="whatsapp"
                  name="whatsapp"
                  type="tel"
                  inputMode="tel"
                  placeholder="(85) 99999-9999"
                  className={CAMPO_CLASSES}
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <input type="hidden" name="perfil" value={tipo} />
            {tipo === "tecnico" && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Conta de veterinário ou zootecnista. Você não cadastra fazenda aqui: depois de criar a
                conta, o produtor (ou o gestor do programa) libera seu acesso a cada fazenda que você
                atende, pelo seu e-mail.
              </p>
            )}
            <div className="flex flex-col gap-1">
              <label htmlFor="nome" className={LABEL_CLASSES}>
                Seu nome
              </label>
              <input id="nome" name="nome" type="text" required autoComplete="name" className={CAMPO_CLASSES} />
            </div>
          </>
        )}

        <CamposAcesso />

        {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}

        <Botoes onClose={onClose} pending={semFazenda ? semFazendaPending : fazendaPending} />
      </form>
    </div>
  );
}
