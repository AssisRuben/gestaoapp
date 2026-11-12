"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { criarFazendaTecnico, criarFazendasLote, type ResultadoLote } from "./actions";
import {
  INSTRUCOES_FAZENDAS,
  MODELO_FAZENDAS,
  lerFazendas,
  type LinhaFazenda,
} from "@/lib/planilha-fazendas";
import type { Celula } from "@/lib/planilha-rebanho";

const CAMPO =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const BOTAO =
  "rounded-full bg-brand-green px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50";
const BOTAO_2 =
  "rounded-full border border-black/[.08] px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]";
const CARTAO = "flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]";

function Campo({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function UmaFazenda() {
  const [state, action, pending] = useActionState(criarFazendaTecnico, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) queueMicrotask(() => formRef.current?.reset());
  }, [state]);

  return (
    <section className={CARTAO}>
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Uma fazenda</h2>
      <form ref={formRef} action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo id="f_nome" label="Nome da fazenda *">
          <input id="f_nome" name="nome_propriedade" required className={CAMPO} />
        </Campo>
        <Campo id="f_produtor" label="Nome do produtor *">
          <input id="f_produtor" name="nome_produtor" required className={CAMPO} />
        </Campo>
        <Campo id="f_municipio" label="Município">
          <input id="f_municipio" name="municipio" className={CAMPO} />
        </Campo>
        <Campo id="f_uf" label="UF">
          <input id="f_uf" name="estado" maxLength={2} className={`${CAMPO} uppercase`} />
        </Campo>
        <Campo id="f_tecnico" label="Técnico responsável">
          <input id="f_tecnico" name="tecnico_responsavel" className={CAMPO} />
        </Campo>
        <div className="flex items-end">
          <button type="submit" disabled={pending} className={`${BOTAO} w-full py-3`}>
            {pending ? "Cadastrando..." : "Cadastrar fazenda"}
          </button>
        </div>
      </form>
      {state?.error && <p className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      {state?.success && <p className="text-sm text-brand-green-dark dark:text-green-400">{state.success}</p>}
    </section>
  );
}

function Planilha() {
  const [linhas, setLinhas] = useState<LinhaFazenda[] | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [previa, setPrevia] = useState<ResultadoLote | null>(null);
  const [final, setFinal] = useState<ResultadoLote | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, startOcupado] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  function recomecar() {
    setLinhas(null);
    setAvisos([]);
    setPrevia(null);
    setFinal(null);
    setErro(null);
    if (entrada.current) entrada.current.value = "";
  }

  async function baixarModelo() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(MODELO_FAZENDAS), "Fazendas");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCOES_FAZENDAS), "Instruções");
    XLSX.writeFile(wb, "modelo-fazendas-gestao-pec.xlsx");
  }

  async function lerArquivo(arquivo: File) {
    recomecar();
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await arquivo.arrayBuffer(), { cellDates: true });
      const nome = wb.SheetNames.find((n) => !/instru/i.test(n));
      if (!nome) return setErro("A planilha não tem nenhuma aba com dados.");
      const tabela = XLSX.utils.sheet_to_json<Celula[]>(wb.Sheets[nome], { header: 1, raw: true, defval: "" });
      const lido = lerFazendas(tabela);
      if (lido.linhas.length === 0) {
        return setErro("Não achei nenhuma linha preenchida. Confira se a primeira linha tem os nomes das colunas (use o modelo).");
      }
      setLinhas(lido.linhas);
      setAvisos(lido.colunasIgnoradas.length ? [`Colunas ignoradas: ${lido.colunasIgnoradas.join(", ")}`] : []);
      startOcupado(async () => {
        const { resultado, error } = await criarFazendasLote(lido.linhas, false);
        if (error || !resultado) setErro(error ?? "Não consegui conferir a planilha.");
        else setPrevia(resultado);
      });
    } catch {
      setErro("Não consegui ler o arquivo. Use o modelo .xlsx (ou salve a planilha como .xlsx).");
    }
  }

  function cadastrar() {
    if (!linhas || !previa) return;
    // só as linhas que a conferência aprovou (as com erro ficam de fora e aparecem na lista)
    const certas = new Set(previa.linhas.filter((l) => l.ok).map((l) => l.linha));
    startOcupado(async () => {
      const { resultado, error } = await criarFazendasLote(
        linhas.filter((l) => certas.has(l.linha)),
        true,
      );
      if (error || !resultado) setErro(error ?? "Não consegui cadastrar.");
      else setFinal(resultado);
    });
  }

  const motivo = (linha: number) => previa?.linhas.find((l) => l.linha === linha);

  return (
    <section className={CARTAO}>
      <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Várias fazendas por planilha</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={baixarModelo} className={BOTAO_2}>
          1. Baixar o modelo (.xlsx)
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="arq_fazendas" className="text-sm text-zinc-600 dark:text-zinc-400">
          2. Escolha a planilha preenchida
        </label>
        <input
          id="arq_fazendas"
          ref={entrada}
          type="file"
          accept=".xlsx,.xls"
          disabled={ocupado}
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void lerArquivo(arquivo);
          }}
          className="text-sm text-black dark:text-zinc-50"
        />
      </div>

      {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
      {avisos.map((a) => (
        <p key={a} className="text-sm text-zinc-600 dark:text-zinc-400">
          {a}
        </p>
      ))}
      {ocupado && <p className="text-sm text-zinc-600 dark:text-zinc-400">Aguarde...</p>}

      {linhas && previa && !final && (
        <div className="flex flex-col gap-3">
          <p className="text-base text-black dark:text-zinc-50">
            3. Confira antes de gravar — até aqui nada foi cadastrado.{" "}
            <strong>{previa.ok} certa(s)</strong>
            {previa.erros > 0 && <>, <strong className="text-red-600 dark:text-red-400">{previa.erros} com erro</strong></>}.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-zinc-600 dark:text-zinc-400">
                <tr>
                  <th className="py-1 pr-3">Linha</th>
                  <th className="py-1 pr-3">Fazenda</th>
                  <th className="py-1 pr-3">Produtor</th>
                  <th className="py-1 pr-3">Município/UF</th>
                  <th className="py-1">Situação</th>
                </tr>
              </thead>
              <tbody className="text-black dark:text-zinc-50">
                {linhas.map((l) => {
                  const r = motivo(l.linha);
                  return (
                    <tr key={l.linha} className="border-t border-black/[.06] dark:border-white/[.08]">
                      <td className="py-1 pr-3">{l.linha}</td>
                      <td className="py-1 pr-3">{l.nome_propriedade}</td>
                      <td className="py-1 pr-3">{l.nome_produtor}</td>
                      <td className="py-1 pr-3">{[l.municipio, l.estado].filter(Boolean).join("/")}</td>
                      <td className={`py-1 ${r?.ok ? "text-brand-green-dark dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {r?.ok ? "ok" : (r?.erro ?? "")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={cadastrar} disabled={ocupado || previa.ok === 0} className={BOTAO}>
              {previa.erros > 0 ? `Cadastrar só as ${previa.ok} certas` : `Cadastrar ${previa.ok} fazenda(s)`}
            </button>
            <button type="button" onClick={recomecar} disabled={ocupado} className={BOTAO_2}>
              Escolher outra planilha
            </button>
          </div>
        </div>
      )}

      {final && (
        <div className="flex flex-col gap-2">
          <p className="text-base font-medium text-brand-green-dark dark:text-green-400">
            {final.ok} fazenda(s) cadastrada(s). Troque de fazenda pelo seletor do cabeçalho para continuar.
          </p>
          {final.erros > 0 && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {final.erros} não foi(ram) cadastrada(s): {final.linhas.filter((l) => !l.ok).map((l) => `linha ${l.linha} (${l.erro})`).join("; ")}
            </p>
          )}
          <button type="button" onClick={recomecar} className={`${BOTAO_2} self-start`}>
            Cadastrar outra planilha
          </button>
        </div>
      )}
    </section>
  );
}

export function FazendasClient() {
  return (
    <div className="flex flex-col gap-4">
      <UmaFazenda />
      <Planilha />
    </div>
  );
}
