"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { salvarPesagem, type ResultadoPesagem } from "../actions";
import { useSuccessToast, SuccessToast } from "../../toast";
import { formatarDataBR } from "../../format";
import { hojeBrasil } from "@/lib/datas";

export type VacaPesagem = { id: string; numero: number; dataParto: string };
export type RegistroPesagem = { vacaId: string; data: string; periodo: string | null; litros: number };

type Periodo = "manha" | "tarde" | "dia_inteiro";

const PERIODOS: [Periodo, string][] = [
  ["manha", "Manhã"],
  ["tarde", "Tarde"],
  ["dia_inteiro", "Dia inteiro"],
];

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";

function periodoPelaHora(): Periodo {
  const hora = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Fortaleza", hour: "numeric", hourCycle: "h23" }).format(new Date()),
  );
  return hora < 12 ? "manha" : "tarde";
}

function lerLitros(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

function ListaPesagem({
  vacas,
  registros,
  data,
  periodo,
}: {
  vacas: VacaPesagem[];
  registros: RegistroPesagem[];
  data: string;
  periodo: Periodo;
}) {
  const router = useRouter();
  const [salvando, startSalvar] = useTransition();
  const [resultado, setResultado] = useState<ResultadoPesagem | null>(null);
  const { mensagemToast, mostrarToast } = useSuccessToast();

  const lancados = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of registros) if (r.data === data && r.periodo === periodo) m.set(r.vacaId, r.litros);
    return m;
  }, [registros, data, periodo]);

  const ultimos = useMemo(() => {
    const m = new Map<string, RegistroPesagem>();
    for (const r of registros) {
      if (r.data >= data && !(r.data === data && r.periodo !== periodo)) continue;
      const atual = m.get(r.vacaId);
      if (!atual || r.data > atual.data) m.set(r.vacaId, r);
    }
    return m;
  }, [registros, data, periodo]);

  // Estado inicial = o que já está lançado nesta data/ordenha (o componente é remontado ao trocar).
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(vacas.map((v) => [v.id, lancados.has(v.id) ? String(lancados.get(v.id)).replace(".", ",") : ""])),
  );

  const linhas = vacas.map((v) => {
    const litros = lerLitros(valores[v.id] ?? "");
    const antes = v.dataParto > data;
    const invalido = litros !== null && (Number.isNaN(litros) || litros <= 0 || litros > 100);
    const lancado = lancados.get(v.id);
    const alterado = litros !== null && !invalido && litros !== lancado;
    return { vaca: v, litros, antes, invalido, lancado, alterado };
  });

  const pendentes = linhas.filter((l) => l.alterado && !l.antes);
  const preenchidas = linhas.filter((l) => l.litros !== null && !l.invalido).length;
  const total = linhas.reduce((s, l) => s + (l.litros !== null && !l.invalido ? l.litros : 0), 0);
  const temInvalido = linhas.some((l) => l.invalido);

  function focarProximo(atual: HTMLInputElement) {
    const campos = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-pesagem]:not(:disabled)"));
    const i = campos.indexOf(atual);
    campos[i + 1]?.focus();
  }

  function salvar() {
    const itens = pendentes.map((l) => ({ vaca_id: l.vaca.id, litros: l.litros as number }));
    startSalvar(async () => {
      const r = await salvarPesagem(data, periodo, itens);
      setResultado(r);
      if (!r.error) {
        const feitos = (r.salvos ?? 0) + (r.corrigidos ?? 0);
        if (feitos > 0) mostrarToast(`Pesagem salva: ${feitos} ${feitos === 1 ? "vaca" : "vacas"}`);
        router.refresh();
      }
    });
  }

  return (
    <>
      <SuccessToast mensagem={mensagemToast} />

      <div className="flex items-center justify-between rounded-2xl border bg-surface border-black/[.08] px-4 py-3 dark:border-white/[.145]">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {preenchidas} de {vacas.length} vacas
        </span>
        <span className="font-mono text-xl font-bold tabular-nums text-black dark:text-zinc-50">{fmt(total)} L</span>
      </div>

      {vacas.length === 0 ? (
        <p className="rounded-2xl border bg-surface border-black/[.08] p-6 text-center text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
          Nenhuma vaca em lactação. Registre o parto na aba{" "}
          <Link href="/reproducao" className="text-reproducao-ink hover:underline">
            Reprodução
          </Link>{" "}
          pra ela aparecer aqui.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border bg-surface border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
          {linhas.map(({ vaca, antes, invalido, lancado, alterado }) => {
            const ultimo = ultimos.get(vaca.id);
            return (
              <li key={vaca.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-medium text-black dark:text-zinc-50">Vaca {vaca.numero}</span>
                  <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
                    {antes
                      ? `pariu em ${formatarDataBR(vaca.dataParto)}`
                      : ultimo
                        ? `última: ${fmt(ultimo.litros)} L em ${formatarDataBR(ultimo.data).slice(0, 5)}`
                        : "sem pesagem anterior"}
                  </span>
                </div>
                {lancado !== undefined && !alterado && !invalido && (
                  <span className="rounded-full bg-brand-green/10 px-2 py-0.5 text-xs font-medium text-brand-green">salvo</span>
                )}
                {alterado && <span className="rounded-full bg-leite-tint px-2 py-0.5 text-xs font-medium text-leite-ink">novo</span>}
                <label className="sr-only" htmlFor={`litros_${vaca.id}`}>
                  Litros da vaca {vaca.numero}
                </label>
                <div className="relative w-28 shrink-0">
                  <input
                    id={`litros_${vaca.id}`}
                    data-pesagem
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    disabled={antes}
                    value={valores[vaca.id] ?? ""}
                    onChange={(e) => setValores((v) => ({ ...v, [vaca.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        focarProximo(e.currentTarget);
                      }
                    }}
                    aria-invalid={invalido}
                    className={`w-full pr-8 text-right tabular-nums disabled:opacity-40 ${CAMPO_CLASSES} ${
                      invalido ? "border-red-500 dark:border-red-400" : ""
                    }`}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">L</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {resultado?.error && <p className="text-sm text-red-600 dark:text-red-400">{resultado.error}</p>}
      {resultado?.erros && resultado.erros.length > 0 && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700 dark:text-red-300">
          <p className="font-medium">Algumas vacas não foram salvas:</p>
          <ul className="mt-1 list-disc pl-5">
            {resultado.erros.map((e) => (
              <li key={e.vaca_id}>
                {e.numero !== null ? `Vaca ${e.numero}` : "Vaca"}: {e.mensagem}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="sticky bottom-16 z-20 -mx-4 mt-auto border-t border-black/[.08] bg-white/95 px-4 py-3 backdrop-blur sm:bottom-0 sm:mx-0 sm:rounded-2xl sm:border dark:border-white/[.145] dark:bg-zinc-950/95">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando || pendentes.length === 0 || temInvalido}
          className="w-full rounded-full bg-brand-green px-5 py-3 text-base font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50"
        >
          {salvando
            ? "Salvando..."
            : temInvalido
              ? "Corrija os valores em vermelho"
              : pendentes.length === 0
                ? "Nada novo pra salvar"
                : `Salvar pesagem (${pendentes.length} ${pendentes.length === 1 ? "vaca" : "vacas"})`}
        </button>
      </div>
    </>
  );
}

export function PesagemClient({ vacas, registros }: { vacas: VacaPesagem[]; registros: RegistroPesagem[] }) {
  const hoje = hojeBrasil();
  const [data, setData] = useState(hoje);
  const [periodo, setPeriodo] = useState<Periodo>(periodoPelaHora);

  return (
    <div className="flex flex-1 flex-col gap-4 pb-20 sm:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Pesagem do dia</h1>
        <Link href="/leite" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← Voltar pro Leite
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-col gap-1 sm:w-48">
          <label htmlFor="pesagem_data" className="text-base font-medium text-black dark:text-zinc-50">
            Data
          </label>
          <input
            id="pesagem_data"
            type="date"
            max={hoje}
            value={data}
            onChange={(e) => e.target.value && setData(e.target.value)}
            className={CAMPO_CLASSES}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <span className="text-base font-medium text-black dark:text-zinc-50">Ordenha</span>
          <div role="radiogroup" aria-label="Ordenha" className="grid grid-cols-3 gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[.08]">
            {PERIODOS.map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={periodo === valor}
                onClick={() => setPeriodo(valor)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors ${
                  periodo === valor
                    ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                    : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ListaPesagem key={`${data}|${periodo}`} vacas={vacas} registros={registros} data={data} periodo={periodo} />
    </div>
  );
}
