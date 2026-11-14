"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { registrarAbastecimentoBotijao, excluirAbastecimentoBotijao } from "./actions";
import { formatarDataBR } from "../format";
import { hojeBrasil } from "@/lib/datas";
import { Autoria } from "../autoria";
import type { AbastecimentoBotijao } from "./types";

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const LABEL_CLASSES = "text-base font-medium text-black dark:text-zinc-50";

const moeda = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const nivel = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(v)} cm`;

// Foto do celular tem 3–10 MB: reduz pra no máximo 1600 px e JPEG 80% (~200–400 KB) antes de
// enviar. Se o navegador não conseguir decodificar, manda o arquivo como está.
async function reduzirFoto(arquivo: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(arquivo);
    const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.8));
    if (!blob) return arquivo;
    return new File([blob], "botijao.jpg", { type: "image/jpeg" });
  } catch {
    return arquivo;
  }
}

// Bloco "Botijão de nitrogênio": cada fazenda tem um. Produtor e técnico registram o abastecimento
// (nível em cm, data, valor e foto obrigatória); o valor também vira despesa no Financeiro.
export function BotijaoNitrogenio({
  abastecimentos,
  nomes,
  onSucesso,
}: {
  abastecimentos: AbastecimentoBotijao[];
  nomes: Record<string, string>;
  onSucesso: (mensagem: string) => void;
}) {
  const [formAberto, setFormAberto] = useState(false);
  const [excluirState, excluirAction, excluindo] = useActionState(excluirAbastecimentoBotijao, undefined);
  // exclusão em dois cliques (regra 6 do CLAUDE.md)
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  useEffect(() => {
    if (excluirState?.success) {
      queueMicrotask(() => {
        setConfirmandoId(null);
        onSucesso("Abastecimento excluído (a despesa também saiu do Financeiro).");
      });
    }
  }, [excluirState, onSucesso]);

  const ultimo = abastecimentos[0];
  const recentes = abastecimentos.slice(0, 3);
  const antigos = abastecimentos.slice(3);

  const linha = (a: AbastecimentoBotijao) => (
    <li
      key={a.id}
      className="flex gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
    >
      {a.foto_url ? (
        <a href={a.foto_url} target="_blank" rel="noreferrer" className="shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do Storage */}
          <img
            src={a.foto_url}
            alt={`Régua do botijão em ${formatarDataBR(a.data)}`}
            className="h-16 w-16 rounded-lg object-cover"
          />
        </a>
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs text-zinc-500 dark:bg-white/[.08]">
          sem foto
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-base text-black dark:text-zinc-50">
          <strong>{formatarDataBR(a.data)}</strong> · {nivel(a.nivel_cm)} · {moeda(a.valor)}
        </p>
        <Autoria registro={a} nomes={nomes} />
        {confirmandoId === a.id ? (
          <form action={excluirAction} className="flex flex-wrap items-center gap-2 pt-1">
            <input type="hidden" name="abastecimento_id" value={a.id} />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Apagar também a despesa de {moeda(a.valor)}?</span>
            <button
              type="submit"
              disabled={excluindo}
              className="rounded-full bg-red-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-60"
            >
              {excluindo ? "Apagando..." : "Sim, excluir"}
            </button>
            <button type="button" onClick={() => setConfirmandoId(null)} className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
              Cancelar
            </button>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmandoId(a.id)}
            className="self-start text-sm text-red-700 hover:underline dark:text-red-400"
          >
            Excluir
          </button>
        )}
      </div>
    </li>
  );

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] p-4 dark:border-white/[.145]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Botijão de nitrogênio</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {ultimo
              ? `Último abastecimento: ${formatarDataBR(ultimo.data)} · nível ${nivel(ultimo.nivel_cm)}`
              : "Nenhum abastecimento registrado ainda."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormAberto(true)}
          className="whitespace-nowrap rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark"
        >
          + Registrar abastecimento
        </button>
      </div>

      {excluirState?.error && <p className="text-sm text-red-700 dark:text-red-400">{excluirState.error}</p>}

      {abastecimentos.length > 0 && <ul className="flex flex-col gap-2">{recentes.map(linha)}</ul>}
      {antigos.length > 0 && (
        <details className="text-base">
          <summary className="cursor-pointer text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Abastecimentos anteriores ({antigos.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">{antigos.map(linha)}</ul>
        </details>
      )}

      {formAberto && (
        <AbastecimentoModal
          onFechar={() => setFormAberto(false)}
          onSucesso={() => {
            setFormAberto(false);
            onSucesso("Abastecimento registrado — a despesa foi lançada no Financeiro.");
          }}
        />
      )}
    </section>
  );
}

function AbastecimentoModal({ onFechar, onSucesso }: { onFechar: () => void; onSucesso: () => void }) {
  const [state, action, pending] = useActionState(registrarAbastecimentoBotijao, undefined);
  const [preparando, setPreparando] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.success) queueMicrotask(onSucesso);
  }, [state, onSucesso]);

  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa);
    };
  }, [previa]);

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroLocal(null);
    const form = e.currentTarget;
    const arquivo = arquivoRef.current?.files?.[0];
    if (!arquivo) {
      setErroLocal("A foto do nível é obrigatória.");
      return;
    }
    setPreparando(true);
    const dados = new FormData(form);
    dados.set("foto", await reduzirFoto(arquivo));
    setPreparando(false);
    startTransition(() => action(dados));
  }

  const ocupado = pending || preparando;
  const erro = erroLocal ?? state?.error;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onFechar} />
      <form
        onSubmit={enviar}
        className="relative flex max-h-full w-full max-w-sm flex-col gap-4 overflow-y-auto rounded-2xl bg-white p-6 dark:bg-zinc-950"
      >
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Abastecimento do botijão</h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="botijao_data" className={LABEL_CLASSES}>
            Data
          </label>
          <input
            id="botijao_data"
            name="data"
            type="date"
            required
            defaultValue={hojeBrasil()}
            max={hojeBrasil()}
            className={CAMPO_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="botijao_nivel" className={LABEL_CLASSES}>
            Nível na régua (cm)
          </label>
          <input
            id="botijao_nivel"
            name="nivel_cm"
            type="text"
            inputMode="decimal"
            required
            placeholder="Ex.: 42,5"
            className={CAMPO_CLASSES}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="botijao_valor" className={LABEL_CLASSES}>
            Valor pago (R$)
          </label>
          <input
            id="botijao_valor"
            name="valor"
            type="text"
            inputMode="decimal"
            required
            placeholder="Ex.: 180,00"
            className={CAMPO_CLASSES}
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Também entra no Financeiro como despesa (inseminação artificial).
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="botijao_foto" className={LABEL_CLASSES}>
            Foto da régua (obrigatória)
          </label>
          <input
            ref={arquivoRef}
            id="botijao_foto"
            type="file"
            accept="image/*"
            required
            onChange={(e) => {
              const f = e.target.files?.[0];
              setPrevia(f ? URL.createObjectURL(f) : null);
            }}
            className="text-base text-black file:mr-3 file:rounded-full file:border-0 file:bg-zinc-200 file:px-4 file:py-2 file:text-sm file:font-medium dark:text-zinc-50 dark:file:bg-white/[.12]"
          />
          {previa && (
            // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
            <img src={previa} alt="Prévia da foto" className="mt-1 max-h-48 w-full rounded-lg object-cover" />
          )}
        </div>

        {erro && <p className="text-sm text-red-700 dark:text-red-400">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onFechar}
            className="rounded-full px-4 py-2 text-sm font-medium text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={ocupado}
            className="rounded-full bg-brand-green px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-60"
          >
            {ocupado ? "Enviando..." : "Registrar"}
          </button>
        </div>
      </form>
    </div>
  );
}
