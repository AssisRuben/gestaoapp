"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { importarRebanho, type ResultadoImportacao } from "../actions";
import {
  COLUNAS,
  INSTRUCOES,
  MODELO,
  NOME_ABA,
  abaPeloCabecalho,
  abaPeloNome,
  dadosVazios,
  lerTabela,
  tabelaDoTexto,
  type Aba,
  type Celula,
  type DadosImportacao,
} from "@/lib/planilha-rebanho";
import { formatarDataBR } from "../../format";

const CAMPO =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const BOTAO =
  "rounded-full bg-brand-green px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark disabled:opacity-50";
const BOTAO_2 =
  "rounded-full border border-black/[.08] px-4 py-2.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]";
const CARTAO = "flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]";

const ABAS: Aba[] = ["vacas", "bezerros", "leite"];
const LIMITE_PREVIA = 300;

const data = (iso: string) => (iso ? formatarDataBR(iso) : "");
const ROTULO: Record<string, string> = {
  lactacao: "Lactação", seca: "Seca", novilha: "Novilha",
  positivo: "Prenhe", negativo: "Vazia", pendente: "Pendente",
  macho: "Macho", femea: "Fêmea", natimorto: "Natimorto",
  manha: "Manhã", tarde: "Tarde", dia_inteiro: "Dia inteiro",
};
const r = (v: string) => ROTULO[v] ?? v;

// O que aparece na prévia de cada aba (as colunas que a pessoa preencheu).
function celulas(aba: Aba, linha: DadosImportacao[Aba][number]): string[] {
  if (aba === "vacas") {
    const v = linha as DadosImportacao["vacas"][number];
    return [
      v.numero, v.nome, r(v.situacao), v.numero_mae, data(v.data_parto),
      [v.bezerro_numero, r(v.bezerro_sexo)].filter(Boolean).join(" "),
      [data(v.data_cobertura), v.touro, r(v.diagnostico)].filter(Boolean).join(" · "),
    ];
  }
  if (aba === "bezerros") {
    const b = linha as DadosImportacao["bezerros"][number];
    return [b.numero, r(b.sexo), data(b.data_nascimento), b.numero_mae];
  }
  const l = linha as DadosImportacao["leite"][number];
  return [l.numero_vaca, data(l.data), l.litros.replace(".", ","), r(l.ordenha)];
}

const CABECALHO: Record<Aba, string[]> = {
  vacas: ["Número", "Nome", "Situação", "Mãe", "Último parto", "Bezerro", "Cobertura"],
  bezerros: ["Número", "Sexo", "Nascimento", "Mãe"],
  leite: ["Vaca", "Data", "Litros", "Ordenha"],
};

async function textoDoArquivo(arquivo: File) {
  const bytes = await arquivo.arrayBuffer();
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  // CSV salvo pelo Excel em português costuma vir em Windows-1252 (acentos viram "�" em UTF-8)
  return utf8.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf8;
}

export function ImportarClient({ nomeFazenda }: { nomeFazenda: string }) {
  const [entrada, setEntrada] = useState<"arquivo" | "colar">("arquivo");
  const [texto, setTexto] = useState("");
  const [abaColada, setAbaColada] = useState<Aba | "auto">("auto");
  const [dados, setDados] = useState<DadosImportacao | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [previa, setPrevia] = useState<ResultadoImportacao | null>(null);
  const [final, setFinal] = useState<ResultadoImportacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, startOcupado] = useTransition();

  function recomecar() {
    setDados(null);
    setAvisos([]);
    setPrevia(null);
    setFinal(null);
    setErro(null);
  }

  async function baixarModelo() {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    for (const aba of ABAS) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(MODELO[aba]), NOME_ABA[aba]);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(INSTRUCOES), "Instruções");
    XLSX.writeFile(wb, "modelo-rebanho-gestao-pec.xlsx");
  }

  function conferir(novos: DadosImportacao, novosAvisos: string[]) {
    const total = novos.vacas.length + novos.bezerros.length + novos.leite.length;
    if (total === 0) {
      setErro("Não achei nenhuma linha preenchida. Confira se a primeira linha tem os nomes das colunas (use o modelo).");
      return;
    }
    setDados(novos);
    setAvisos(novosAvisos);
    startOcupado(async () => {
      const { resultado, error } = await importarRebanho(novos, "validar");
      if (error || !resultado) setErro(error ?? "Não consegui conferir a planilha.");
      else setPrevia(resultado);
    });
  }

  async function lerArquivo(arquivo: File) {
    recomecar();
    const novos = dadosVazios();
    const novosAvisos: string[] = [];
    try {
      if (/\.(csv|txt)$/i.test(arquivo.name)) {
        const tabela = tabelaDoTexto(await textoDoArquivo(arquivo));
        const cab = tabela.find((l) => l.some((c) => String(c ?? "").trim() !== "")) ?? [];
        const aba = abaPeloCabecalho(cab) ?? "vacas";
        const lido = lerTabela(tabela, aba, novos);
        if (lido.colunasIgnoradas.length) novosAvisos.push(`${NOME_ABA[aba]}: colunas ignoradas — ${lido.colunasIgnoradas.join(", ")}`);
      } else {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await arquivo.arrayBuffer(), { cellDates: true });
        for (const nome of wb.SheetNames) {
          const tabela = XLSX.utils.sheet_to_json<Celula[]>(wb.Sheets[nome], { header: 1, raw: true, defval: "" });
          const cab = tabela.find((l) => l.some((c) => String(c ?? "").trim() !== ""));
          if (!cab) continue;
          const aba = abaPeloNome(nome) ?? abaPeloCabecalho(cab);
          if (!aba) {
            if (!/instru/i.test(nome)) novosAvisos.push(`Aba "${nome}" ignorada: não reconheci as colunas.`);
            continue;
          }
          const lido = lerTabela(tabela, aba, novos);
          if (lido.colunasIgnoradas.length) novosAvisos.push(`${nome}: colunas ignoradas — ${lido.colunasIgnoradas.join(", ")}`);
        }
      }
    } catch {
      setErro("Não consegui abrir esse arquivo. Use .xlsx (Excel/Google Planilhas) ou .csv.");
      return;
    }
    conferir(novos, novosAvisos);
  }

  function lerColado() {
    recomecar();
    const tabela = tabelaDoTexto(texto);
    const cab = tabela.find((l) => l.some((c) => String(c ?? "").trim() !== "")) ?? [];
    const aba = abaColada === "auto" ? abaPeloCabecalho(cab) : abaColada;
    if (!aba) {
      setErro("Não reconheci as colunas. Copie junto a linha dos títulos (Número, Situação…) ou escolha o tipo da tabela.");
      return;
    }
    const novos = dadosVazios();
    const lido = lerTabela(tabela, aba, novos);
    conferir(novos, lido.colunasIgnoradas.length ? [`Colunas ignoradas: ${lido.colunasIgnoradas.join(", ")}`] : []);
  }

  function gravar(modo: "importar" | "importar_ok") {
    if (!dados) return;
    startOcupado(async () => {
      const { resultado, error } = await importarRebanho(dados, modo);
      if (error || !resultado) setErro(error ?? "Não consegui importar.");
      else if (!resultado.importado) {
        setPrevia(resultado);
        setErro("Nada foi gravado: a planilha tem linhas com erro. Corrija ou importe só as linhas certas.");
      } else setFinal(resultado);
    });
  }

  // ---------- importação concluída ----------
  if (final) {
    const c = final.contagem;
    return (
      <div className={CARTAO}>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Importação concluída</h2>
        <p className="text-black dark:text-zinc-50">
          {c.vacas} {c.vacas === 1 ? "vaca" : "vacas"}, {c.bezerros} {c.bezerros === 1 ? "bezerro" : "bezerros"} e{" "}
          {c.leite} {c.leite === 1 ? "pesagem" : "pesagens"} de leite gravados na {nomeFazenda}.
        </p>
        {final.erros.length > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {final.erros.length} {final.erros.length === 1 ? "linha ficou" : "linhas ficaram"} de fora, com erro. Corrija na
            planilha e importe só essas linhas de novo.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Link href="/vacas" className={BOTAO}>Ver as vacas</Link>
          <button type="button" onClick={recomecar} className={BOTAO_2}>Importar outra planilha</button>
        </div>
      </div>
    );
  }

  const erroDe = new Map((previa?.erros ?? []).map((e) => [`${e.aba}:${e.linha}`, e.mensagem]));
  const totalLinhas = dados ? dados.vacas.length + dados.bezerros.length + dados.leite.length : 0;
  const totalErros = previa?.erros.length ?? 0;
  const totalCertas = totalLinhas - totalErros;

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- 1. modelo ---------- */}
      <section className={CARTAO}>
        <h2 className="text-base font-semibold text-black dark:text-zinc-50">1. Preencha o modelo</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Uma planilha com três abas: <strong>Vacas</strong> (uma linha por vaca, com parto, cobertura e
          diagnóstico atuais), <strong>Bezerros</strong> e <strong>Leite</strong> (pesagens da lactação atual).
          Abas vazias são ignoradas. A sua planilha pode ter outros nomes de coluna parecidos — a conferência
          mostra o que foi entendido.
        </p>
        <button type="button" onClick={baixarModelo} className={`${BOTAO_2} self-start`}>
          ⬇ Baixar o modelo (.xlsx)
        </button>
      </section>

      {/* ---------- 2. carregar ---------- */}
      <section className={CARTAO}>
        <h2 className="text-base font-semibold text-black dark:text-zinc-50">2. Carregue a planilha</h2>
        <div role="radiogroup" aria-label="Como carregar" className="grid grid-cols-2 gap-1 self-start rounded-full bg-zinc-100 p-1 dark:bg-white/[.08]">
          {(
            [
              ["arquivo", "Arquivo"],
              ["colar", "Copiar e colar"],
            ] as const
          ).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="radio"
              aria-checked={entrada === valor}
              onClick={() => setEntrada(valor)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                entrada === valor ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-zinc-50" : "text-zinc-600 dark:text-zinc-400"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {entrada === "arquivo" ? (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Excel ou Google Planilhas (.xlsx) ou .csv</span>
            <input
              id="arquivo_planilha"
              type="file"
              accept=".xlsx,.xls,.ods,.csv,.txt"
              disabled={ocupado}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
                e.target.value = "";
              }}
              className="text-sm text-black file:mr-3 file:rounded-full file:border-0 file:bg-brand-green file:px-4 file:py-2 file:text-sm file:font-medium file:text-white dark:text-zinc-50"
            />
          </label>
        ) : (
          <div className="flex flex-col gap-2">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Na planilha, selecione as células <strong>junto com a linha dos títulos</strong>, copie e cole aqui. Uma
              tabela por vez (Vacas, Bezerros ou Leite).
            </span>
            <textarea
              id="texto_planilha"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
              placeholder={COLUNAS.vacas.map((c) => c.titulo).join("\t")}
              className={`font-mono text-sm ${CAMPO}`}
            />
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
                Tabela de
                <select
                  id="aba_colada"
                  value={abaColada}
                  onChange={(e) => setAbaColada(e.target.value as Aba | "auto")}
                  className={CAMPO}
                >
                  <option value="auto">Descobrir pelos títulos</option>
                  {ABAS.map((a) => (
                    <option key={a} value={a}>{NOME_ABA[a]}</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={lerColado} disabled={ocupado || !texto.trim()} className={BOTAO}>
                Conferir
              </button>
            </div>
          </div>
        )}
        {ocupado && !previa && <p className="text-sm text-zinc-600 dark:text-zinc-400">Conferindo…</p>}
        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}
        {avisos.map((a) => (
          <p key={a} className="text-sm text-amber-700 dark:text-amber-400">{a}</p>
        ))}
      </section>

      {/* ---------- 3. conferência ---------- */}
      {dados && previa && (
        <section className={CARTAO}>
          <h2 className="text-base font-semibold text-black dark:text-zinc-50">3. Confira antes de gravar</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Nada foi gravado ainda.</p>

          <div className="flex flex-wrap gap-2">
            {ABAS.filter((a) => dados[a].length > 0).map((a) => {
              const erros = previa.erros.filter((e) => e.aba === NOME_ABA[a]).length;
              return (
                <span key={a} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-black dark:bg-white/[.08] dark:text-zinc-50">
                  <strong>{NOME_ABA[a]}</strong>: {dados[a].length - erros} {dados[a].length - erros === 1 ? "certa" : "certas"}
                  {erros > 0 && <span className="text-red-600 dark:text-red-400"> · {erros} com erro</span>}
                </span>
              );
            })}
          </div>

          {totalErros > 0 && (
            <div className="flex flex-col gap-1 rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-300">
              <p className="font-medium">Linhas com erro (o número é a linha na planilha):</p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                {previa.erros.map((e) => (
                  <li key={`${e.aba}:${e.linha}:${e.mensagem}`}>
                    {e.aba}, linha {e.linha}: {e.mensagem}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {ABAS.filter((a) => dados[a].length > 0).map((a) => (
            <div key={a} className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-black dark:text-zinc-50">{NOME_ABA[a]}</h3>
              <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                      <th className="px-3 py-1.5 font-medium">Linha</th>
                      {CABECALHO[a].map((t) => (
                        <th key={t} className="px-3 py-1.5 font-medium">{t}</th>
                      ))}
                      <th className="px-3 py-1.5 font-medium">Conferência</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados[a].slice(0, LIMITE_PREVIA).map((linha) => {
                      const msg = erroDe.get(`${NOME_ABA[a]}:${linha.linha}`);
                      return (
                        <tr key={linha.linha} className={`border-b border-black/[.04] dark:border-white/[.06] ${msg ? "bg-red-500/5" : ""}`}>
                          <td className="px-3 py-1.5 tabular-nums text-zinc-600 dark:text-zinc-400">{linha.linha}</td>
                          {celulas(a, linha).map((c, i) => (
                            <td key={i} className="px-3 py-1.5 text-black dark:text-zinc-50">{c || "—"}</td>
                          ))}
                          <td className={`px-3 py-1.5 ${msg ? "text-red-700 dark:text-red-300" : "text-brand-green"}`}>
                            {msg ? `✕ ${msg}` : "✓ ok"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {dados[a].length > LIMITE_PREVIA && (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Mostrando {LIMITE_PREVIA} de {dados[a].length} linhas. Os erros de todas aparecem na lista acima.
                </p>
              )}
            </div>
          ))}

          <div className="flex flex-wrap gap-2">
            {totalErros === 0 ? (
              <button type="button" onClick={() => gravar("importar")} disabled={ocupado} className={BOTAO}>
                {ocupado ? "Gravando…" : `Importar ${totalLinhas} ${totalLinhas === 1 ? "linha" : "linhas"}`}
              </button>
            ) : (
              totalCertas > 0 && (
                <button type="button" onClick={() => gravar("importar_ok")} disabled={ocupado} className={BOTAO}>
                  {ocupado ? "Gravando…" : `Importar só as ${totalCertas} certas`}
                </button>
              )
            )}
            <button type="button" onClick={recomecar} disabled={ocupado} className={BOTAO_2}>
              {totalErros > 0 ? "Corrigir a planilha e carregar de novo" : "Cancelar"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
