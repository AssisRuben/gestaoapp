"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSuccessToast, SuccessToast } from "../toast";
import { formatarDataBR } from "../format";
import { hojeBrasil } from "@/lib/datas";
import {
  aoMudarCampo,
  enviarCampo,
  guardarLancamento,
  lancamentosCampo,
  type LancamentoCampo,
  type TipoCampo,
} from "@/lib/fila-campo";

export type VacaCampo = { id: string; numero: number; produtivo: string; reprodutivo: string };
type TouroCampo = { id: string; nome: string; codigo: string | null; saldo: number };

const CAMPO =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-lg text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";
const ROTULO = "text-base font-medium text-black dark:text-zinc-50";

const TIPOS: [TipoCampo, string][] = [
  ["cobertura", "Cobertura"],
  ["parto", "Parto"],
  ["diagnostico", "Diagnóstico"],
];
const STATUS: Record<string, string> = {
  novilha: "novilha",
  lactacao: "em lactação",
  seca: "seca",
  vazia: "vazia",
  prenhe: "prenhe",
  vazia_em_servico: "em serviço",
};

function Opcoes<T extends string>({
  valor,
  opcoes,
  onChange,
  rotulo,
}: {
  valor: T | null;
  opcoes: [T, string][];
  onChange: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="grid gap-1 rounded-full bg-zinc-100 p-1 dark:bg-white/[.08]" style={{ gridTemplateColumns: `repeat(${opcoes.length}, minmax(0, 1fr))` }}>
      {opcoes.map(([v, r]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={valor === v}
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-2.5 text-sm font-medium transition-colors ${
            valor === v
              ? "bg-white text-black shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
              : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

export function CampoClient({
  propriedadeId,
  vacas,
  touros,
}: {
  propriedadeId: string;
  vacas: VacaCampo[];
  touros: TouroCampo[];
}) {
  const hoje = hojeBrasil();
  const [tipo, setTipo] = useState<TipoCampo>("cobertura");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(hoje);
  const [touroId, setTouroId] = useState("");
  const [touroTexto, setTouroTexto] = useState("");
  const [dosePrograma, setDosePrograma] = useState(false);
  const [sexo, setSexo] = useState<"femea" | "macho" | "natimorto" | null>(null);
  const [numeroCria, setNumeroCria] = useState("");
  const [resultado, setResultado] = useState<"positivo" | "negativo" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [lista, setLista] = useState<LancamentoCampo[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, startEnviar] = useTransition();
  const { mensagemToast, mostrarToast } = useSuccessToast();

  const vaca = useMemo(() => vacas.find((v) => String(v.numero) === numero.trim()) ?? null, [vacas, numero]);
  const touro = touros.find((t) => t.id === touroId) ?? null;

  function tentarEnviar() {
    startEnviar(async () => {
      const r = await enviarCampo();
      if (r.enviados > 0) mostrarToast(`${r.enviados} ${r.enviados === 1 ? "lançamento enviado" : "lançamentos enviados"}`);
      setAviso(r.falha ?? null);
    });
  }

  useEffect(() => {
    const ler = () => setLista(lancamentosCampo().filter((l) => l.propriedadeId === propriedadeId));
    ler();
    const parar = aoMudarCampo(ler);
    if (navigator.onLine && lancamentosCampo().some((l) => l.estado === "guardado")) tentarEnviar();
    window.addEventListener("online", tentarEnviar);
    return () => {
      parar();
      window.removeEventListener("online", tentarEnviar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propriedadeId]);

  function limparFormulario() {
    setNumero("");
    setTouroId("");
    setTouroTexto("");
    setDosePrograma(false);
    setSexo(null);
    setNumeroCria("");
    setResultado(null);
  }

  function lancar() {
    setErro(null);
    if (!vaca) return setErro("Digite o número de uma vaca do rebanho.");
    if (tipo !== "diagnostico" && (!data || data > hoje)) return setErro("Data inválida.");
    if (tipo === "parto" && !sexo) return setErro("Escolha o sexo da cria.");
    if (tipo === "diagnostico" && !resultado) return setErro("Escolha o resultado do diagnóstico.");

    const dados: LancamentoCampo["dados"] =
      tipo === "cobertura"
        ? { vaca_id: vaca.id, data, touro_id: touroId || null, touro_texto: touroId ? null : touroTexto.trim() || null, dose_programa: !!touro && dosePrograma }
        : tipo === "parto"
          ? { vaca_id: vaca.id, data, sexo_bezerro: sexo, numero_bezerro: numeroCria.trim() ? Number(numeroCria) : null }
          : { vaca_id: vaca.id, resultado };

    const descricao =
      tipo === "cobertura"
        ? `Cobertura da vaca ${vaca.numero} em ${formatarDataBR(data)}${touro ? ` (${touro.nome}${dosePrograma ? ", dose do programa" : ""})` : touroTexto.trim() ? ` (${touroTexto.trim()})` : ""}`
        : tipo === "parto"
          ? `Parto da vaca ${vaca.numero} em ${formatarDataBR(data)} (${sexo === "femea" ? "fêmea" : sexo})`
          : `Diagnóstico da vaca ${vaca.numero}: ${resultado}`;

    guardarLancamento({ propriedadeId, tipo, dados, descricao });
    limparFormulario();
    if (navigator.onLine) tentarEnviar();
    else mostrarToast("Sem internet: guardado no celular");
  }

  const guardados = lista.filter((l) => l.estado === "guardado");

  return (
    <div className="flex flex-1 flex-col gap-4 pb-20 sm:pb-0">
      <SuccessToast mensagem={mensagemToast} />

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Lançar no campo</h1>
        <Link href="/reproducao" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          Reprodução →
        </Link>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Funciona sem internet: o lançamento fica guardado no celular e é enviado sozinho quando o sinal voltar.
      </p>

      <Opcoes rotulo="Tipo de lançamento" valor={tipo} opcoes={TIPOS} onChange={(v) => { setTipo(v); setErro(null); }} />

      <div className="flex flex-col gap-3 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <div className="flex flex-col gap-1">
          <label htmlFor="campo_vaca" className={ROTULO}>
            Número da vaca
          </label>
          <input
            id="campo_vaca"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={numero}
            onChange={(e) => setNumero(e.target.value.replace(/\D/g, ""))}
            className={CAMPO}
          />
          {numero && (
            <span className={`text-sm ${vaca ? "text-zinc-600 dark:text-zinc-400" : "text-red-600 dark:text-red-400"}`}>
              {vaca ? `Vaca ${vaca.numero}: ${STATUS[vaca.produtivo] ?? vaca.produtivo}, ${STATUS[vaca.reprodutivo] ?? vaca.reprodutivo}` : "Não achei essa vaca no rebanho."}
            </span>
          )}
        </div>

        {tipo !== "diagnostico" && (
          <div className="flex flex-col gap-1">
            <label htmlFor="campo_data" className={ROTULO}>
              Data {tipo === "cobertura" ? "da cobertura" : "do parto"}
            </label>
            <input id="campo_data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} className={CAMPO} />
          </div>
        )}

        {tipo === "cobertura" && (
          <>
            <div className="flex flex-col gap-1">
              <label htmlFor="campo_touro" className={ROTULO}>
                Touro / sêmen
              </label>
              <select id="campo_touro" value={touroId} onChange={(e) => { setTouroId(e.target.value); setDosePrograma(false); }} className={CAMPO}>
                <option value="">Outro / não sei (escrever)</option>
                {touros.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {t.codigo ? ` (${t.codigo})` : ""}
                    {t.saldo > 0 ? ` — ${t.saldo} dose${t.saldo === 1 ? "" : "s"} do programa` : ""}
                  </option>
                ))}
              </select>
              {!touroId && (
                <input
                  type="text"
                  placeholder="nome do touro (opcional)"
                  value={touroTexto}
                  onChange={(e) => setTouroTexto(e.target.value)}
                  className={CAMPO}
                  aria-label="Nome do touro"
                />
              )}
            </div>
            {touro && touro.saldo > 0 && (
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={dosePrograma} onChange={(e) => setDosePrograma(e.target.checked)} className="h-5 w-5 accent-brand-green" />
                <span className="text-base text-black dark:text-zinc-50">Foi dose do programa (desconta do saldo)</span>
              </label>
            )}
          </>
        )}

        {tipo === "parto" && (
          <>
            <div className="flex flex-col gap-1">
              <span className={ROTULO}>Sexo da cria</span>
              <Opcoes
                rotulo="Sexo da cria"
                valor={sexo}
                opcoes={[["femea", "Fêmea"], ["macho", "Macho"], ["natimorto", "Natimorto"]]}
                onChange={setSexo}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="campo_cria" className={ROTULO}>
                Número da cria (opcional)
              </label>
              <input
                id="campo_cria"
                type="text"
                inputMode="numeric"
                placeholder="automático"
                value={numeroCria}
                onChange={(e) => setNumeroCria(e.target.value.replace(/\D/g, ""))}
                className={CAMPO}
              />
            </div>
          </>
        )}

        {tipo === "diagnostico" && (
          <div className="flex flex-col gap-1">
            <span className={ROTULO}>Resultado</span>
            <Opcoes
              rotulo="Resultado do diagnóstico"
              valor={resultado}
              opcoes={[["positivo", "Prenhe"], ["negativo", "Vazia"]]}
              onChange={setResultado}
            />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Vale pra cobertura mais recente da vaca.</span>
          </div>
        )}

        {erro && <p className="text-sm text-red-600 dark:text-red-400">{erro}</p>}

        <button
          type="button"
          onClick={lancar}
          className="rounded-full bg-brand-green px-5 py-3 text-base font-medium text-white transition-colors hover:bg-brand-green-dark"
        >
          Lançar {TIPOS.find(([v]) => v === tipo)?.[1].toLowerCase()}
        </button>
      </div>

      {(lista.length > 0 || aviso) && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-black dark:text-zinc-50">Lançamentos deste celular</h2>
            {guardados.length > 0 && (
              <button
                type="button"
                onClick={tentarEnviar}
                disabled={enviando}
                className="rounded-full border border-amber-600/40 px-3 py-1 text-sm font-medium text-amber-800 disabled:opacity-50 dark:text-amber-300"
              >
                {enviando ? "Enviando..." : `Enviar agora (${guardados.length})`}
              </button>
            )}
          </div>
          {aviso && <p className="text-sm text-amber-800 dark:text-amber-300">{aviso}</p>}
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border bg-surface border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
            {[...lista].reverse().map((l) => (
              <li key={l.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-black dark:text-zinc-50">{l.descricao}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      l.estado === "guardado"
                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                        : l.estado === "enviado"
                          ? "bg-brand-green/10 text-brand-green"
                          : "bg-red-500/10 text-red-600 dark:text-red-400"
                    }`}
                  >
                    {l.estado === "guardado" ? "no celular" : l.estado === "enviado" ? "enviado" : "recusado"}
                  </span>
                </div>
                {l.estado === "recusado" && l.mensagem && <span className="text-red-600 dark:text-red-400">{l.mensagem}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
