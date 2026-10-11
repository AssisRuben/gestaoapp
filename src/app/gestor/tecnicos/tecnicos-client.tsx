"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { vincularTecnicoGestor, desvincularTecnicoGestor } from "./actions";
import { useSuccessToast, SuccessToast } from "../../(app)/toast";
import { CAMPO_CLASSES, BOTAO_PRIMARIO, Campo } from "../programa/ui";

export type AcessoFazenda = {
  propriedade_id: string;
  usuario_id: string;
  email: string;
  nome: string | null;
  papel: string;
  created_at: string;
};

export type FazendaOpcao = { id: string; nome: string };

const PAPEL_LABEL: Record<string, string> = { produtor: "Produtor", tecnico: "Técnico" };

function RemoverAcesso({ propriedadeId, usuarioId }: { propriedadeId: string; usuarioId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [state, action, pending] = useActionState(desvincularTecnicoGestor, undefined);

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
      >
        Remover
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="propriedade_id" value={propriedadeId} />
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirmando(false)}
          className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Removendo..." : "Confirmar"}
        </button>
      </div>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  );
}

function nomeOuEmail(a: { nome: string | null; email: string }) {
  return a.nome ?? a.email;
}

export function TecnicosClient({
  fazendas,
  acessos,
}: {
  fazendas: FazendaOpcao[];
  acessos: AcessoFazenda[];
}) {
  const [busca, setBusca] = useState("");
  const [vincularState, vincularAction, vincularPending] = useActionState(vincularTecnicoGestor, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const { mensagemToast, mostrarToast } = useSuccessToast();

  useEffect(() => {
    if (vincularState?.success) {
      queueMicrotask(() => {
        formRef.current?.reset();
        mostrarToast("Acesso liberado!");
      });
    }
  }, [vincularState, mostrarToast]);

  const nomeFazenda = useMemo(() => new Map(fazendas.map((f) => [f.id, f.nome])), [fazendas]);

  const porFazenda = useMemo(() => {
    const mapa = new Map<string, AcessoFazenda[]>();
    for (const a of acessos) {
      const lista = mapa.get(a.propriedade_id) ?? [];
      lista.push(a);
      mapa.set(a.propriedade_id, lista);
    }
    return mapa;
  }, [acessos]);

  const tecnicos = useMemo(() => {
    const mapa = new Map<string, { nome: string | null; email: string; fazendas: string[] }>();
    for (const a of acessos) {
      if (a.papel !== "tecnico") continue;
      const t = mapa.get(a.usuario_id) ?? { nome: a.nome, email: a.email, fazendas: [] };
      t.fazendas.push(nomeFazenda.get(a.propriedade_id) ?? "Fazenda sem nome");
      mapa.set(a.usuario_id, t);
    }
    return [...mapa.values()]
      .map((t) => ({ ...t, fazendas: t.fazendas.sort((x, y) => x.localeCompare(y, "pt-BR")) }))
      .sort((x, y) => nomeOuEmail(x).localeCompare(nomeOuEmail(y), "pt-BR"));
  }, [acessos, nomeFazenda]);

  const fazendasFiltradas = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return fazendas;
    return fazendas.filter(
      (f) =>
        f.nome.toLocaleLowerCase("pt-BR").includes(termo) ||
        (porFazenda.get(f.id) ?? []).some(
          (a) =>
            a.email.toLocaleLowerCase("pt-BR").includes(termo) ||
            (a.nome ?? "").toLocaleLowerCase("pt-BR").includes(termo),
        ),
    );
  }, [busca, fazendas, porFazenda]);

  return (
    <div className="flex flex-1 flex-col gap-6">
      <SuccessToast mensagem={mensagemToast} />

      <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Dar acesso a um técnico</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            O técnico cria a conta no site (Cadastre-se → Sou técnico) e passa a ver e lançar os
            dados das fazendas liberadas aqui. O produtor também pode liberar pelo menu da fazenda.
          </p>
        </div>
        <form ref={formRef} action={vincularAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Campo id="tec_fazenda" label="Fazenda">
            <select id="tec_fazenda" name="propriedade_id" required defaultValue="" className={CAMPO_CLASSES}>
              <option value="" disabled>
                Escolha...
              </option>
              {fazendas.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo id="tec_email" label="E-mail do técnico">
            <input id="tec_email" name="email" type="email" required className={CAMPO_CLASSES} />
          </Campo>
          <button type="submit" disabled={vincularPending} className={`${BOTAO_PRIMARIO} py-3`}>
            {vincularPending ? "Liberando..." : "Dar acesso"}
          </button>
        </form>
        {vincularState?.error && (
          <p className="text-sm text-red-600 dark:text-red-400">{vincularState.error}</p>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          Técnicos <span className="font-normal text-zinc-600 dark:text-zinc-400">({tecnicos.length})</span>
        </h2>
        {tecnicos.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nenhum técnico com acesso a fazendas ainda.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.08] rounded-2xl border border-black/[.08] bg-surface dark:divide-white/[.145] dark:border-white/[.145]">
            {tecnicos.map((t) => (
              <li key={t.email} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium text-black dark:text-zinc-50">{nomeOuEmail(t)}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {t.fazendas.length} {t.fazendas.length === 1 ? "fazenda" : "fazendas"}
                  </span>
                </div>
                {t.nome && <span className="text-sm text-zinc-600 dark:text-zinc-400">{t.email}</span>}
                <span className="text-sm text-zinc-600 dark:text-zinc-400">{t.fazendas.join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Acessos por fazenda</h2>
          <input
            type="search"
            placeholder="Buscar fazenda, nome ou e-mail..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className={`w-full sm:max-w-xs ${CAMPO_CLASSES}`}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {fazendasFiltradas.map((f) => {
            const lista = porFazenda.get(f.id) ?? [];
            return (
              <div
                key={f.id}
                className="flex flex-col gap-2 rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]"
              >
                <h3 className="font-semibold text-black dark:text-zinc-50">
                  <Link href={`/gestor/fazendas/${f.id}?de=acessos`} className="hover:underline">
                    {f.nome}
                  </Link>
                </h3>
                {lista.length === 0 ? (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    Nenhuma conta do site (só WhatsApp, ou ainda sem cadastro).
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {lista.map((a) => (
                      <li key={a.usuario_id} className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate text-black dark:text-zinc-50">{nomeOuEmail(a)}</span>
                          <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                            {PAPEL_LABEL[a.papel] ?? a.papel}
                            {a.nome ? ` · ${a.email}` : ""}
                          </span>
                        </div>
                        {a.papel === "tecnico" && (
                          <RemoverAcesso propriedadeId={f.id} usuarioId={a.usuario_id} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {fazendasFiltradas.length === 0 && (
            <p className="text-zinc-600 dark:text-zinc-400">Nada encontrado.</p>
          )}
        </div>
      </section>
    </div>
  );
}
