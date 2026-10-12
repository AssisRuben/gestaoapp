"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { salvarEntidade } from "./actions";
import { Modal, Campo, CAMPO_CLASSES, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from "../programa/ui";
import { useSuccessToast, SuccessToast } from "../../(app)/toast";
import { mascaraCnpj } from "@/lib/cnpj";
import { mascaraTelefone } from "@/lib/telefone";

// Índices por entidade em MÉDIA POR FAZENDA (0050) — pra comparar a eficiência entre entidades.
// Totais só pro que é contagem (doses, kits, gestações, nascidos). A "Média geral" usa todas as
// fazendas que recebem por alguma entidade: verde = melhor que a média geral, vermelho = pior.

type Num = number | string | null;

export type Entidade = {
  entidade_id: string;
  entidade_nome: string;
  cnpj: string | null;
  responsavel: string | null;
  telefone: string | null;
  fazendas: number;
  vacas_lactacao_media: Num;
  producao_dia_media: Num;
  litros_vaca_dia_media: Num;
  receita_mensal_media: Num;
  despesa_mensal_media: Num;
  custo_litro_medio: Num;
  receita_litro_media: Num;
  sobra_litro_media: Num;
  iep_medio: Num;
  taxa_concepcao_media: Num;
  doses_por_prenhez_media: Num;
  doses_recebidas: number;
  doses_pendentes: number;
  kits: number;
  gestacoes_em_curso: number;
  nascimentos: number;
};

export type FazendaEntidade = {
  entidade_id: string;
  propriedade_id: string;
  nome_propriedade: string;
  vacas_lactacao: number | null;
  litros_vaca_dia: Num;
  producao_dia: Num;
  receita_mensal: Num;
  despesa_mensal: Num;
  custo_litro: Num;
  iep_soma: Num;
  iep_qtd: number;
  prenhezes: number;
  negativos: number;
  doses_usadas: number;
  doses_recebidas: number;
  kits: number;
};

const n = (v: Num | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const fmt = (v: number | null, casas = 0) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const reais = (v: number | null, casas = 2) =>
  v === null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });
const media = (vs: (number | null)[]) => {
  const ok = vs.filter((v): v is number => v !== null && Number.isFinite(v));
  return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : null;
};

const CARTAO = "rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]";

type Indices = {
  litrosVaca: number | null;
  producao: number | null;
  receita: number | null;
  despesa: number | null;
  custo: number | null;
  receitaLitro: number | null;
  sobra: number | null;
  iep: number | null;
  concepcao: number | null;
  dosesPrenhez: number | null;
};

const CHAVES: (keyof Indices)[] = [
  "litrosVaca", "producao", "receita", "despesa", "custo", "receitaLitro", "sobra", "iep", "concepcao", "dosesPrenhez",
];

function indicesDaEntidade(e: Entidade): Indices {
  return {
    litrosVaca: n(e.litros_vaca_dia_media),
    producao: n(e.producao_dia_media),
    receita: n(e.receita_mensal_media),
    despesa: n(e.despesa_mensal_media),
    custo: n(e.custo_litro_medio),
    receitaLitro: n(e.receita_litro_media),
    sobra: n(e.sobra_litro_media),
    iep: n(e.iep_medio),
    concepcao: n(e.taxa_concepcao_media),
    dosesPrenhez: n(e.doses_por_prenhez_media),
  };
}

// média geral: cada fazenda conta uma vez, mesmo se recebe por duas entidades
function indicesGerais(fazendas: FazendaEntidade[]): Indices {
  const unicas = [...new Map(fazendas.map((f) => [f.propriedade_id, f])).values()];
  const porFazenda = unicas.map((f) => {
    const producao = n(f.producao_dia);
    const receita = n(f.receita_mensal);
    const custo = n(f.custo_litro);
    const receitaLitro = producao && receita !== null ? receita / (producao * 30) : null;
    return {
      litrosVaca: n(f.litros_vaca_dia),
      producao,
      receita,
      despesa: n(f.despesa_mensal),
      custo,
      receitaLitro,
      sobra: receitaLitro !== null && custo !== null ? receitaLitro - custo : null,
      iep: f.iep_qtd ? (n(f.iep_soma) ?? 0) / f.iep_qtd : null,
      concepcao: f.prenhezes + f.negativos > 0 ? (f.prenhezes * 100) / (f.prenhezes + f.negativos) : null,
      dosesPrenhez: f.prenhezes > 0 ? f.doses_usadas / f.prenhezes : null,
    };
  });
  return Object.fromEntries(CHAVES.map((k) => [k, media(porFazenda.map((f) => f[k]))])) as Indices;
}

// o que é "melhor" em cada índice (pra pintar verde/vermelho contra a média geral)
const MELHOR_MAIOR: Partial<Record<keyof Indices, boolean>> = {
  litrosVaca: true,
  custo: false,
  sobra: true,
  iep: false,
  concepcao: true,
  dosesPrenhez: false,
};

function Numero({
  rotulo,
  valor,
  detalhe,
  comparacao,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  comparacao?: "melhor" | "pior" | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{rotulo}</span>
      <span
        className={`font-mono text-lg font-bold tabular-nums ${
          comparacao === "melhor"
            ? "text-brand-green"
            : comparacao === "pior"
              ? "text-red-600 dark:text-red-400"
              : "text-black dark:text-zinc-50"
        }`}
      >
        {valor}
      </span>
      {detalhe && <span className="text-xs text-zinc-600 dark:text-zinc-400">{detalhe}</span>}
    </div>
  );
}

function comparar(chave: keyof Indices, valor: number | null, geral: Indices | null): "melhor" | "pior" | null {
  const sentido = MELHOR_MAIOR[chave];
  const ref = geral?.[chave] ?? null;
  if (sentido === undefined || valor === null || ref === null || Math.abs(valor - ref) < 1e-9) return null;
  return valor > ref === sentido ? "melhor" : "pior";
}

function GradeIndices({ i, geral }: { i: Indices; geral: Indices | null }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <Numero rotulo="Litros por vaca/dia" valor={fmt(i.litrosVaca, 1)} comparacao={comparar("litrosVaca", i.litrosVaca, geral)} />
      <Numero rotulo="Produção por dia" valor={i.producao === null ? "—" : `${fmt(i.producao)} L`} detalhe="por fazenda" />
      <Numero rotulo="Faturamento por mês" valor={reais(i.receita, 0)} detalhe="por fazenda" />
      <Numero rotulo="Despesa por mês" valor={reais(i.despesa, 0)} detalhe="por fazenda" />
      <Numero rotulo="Custo por litro" valor={reais(i.custo)} comparacao={comparar("custo", i.custo, geral)} />
      <Numero
        rotulo="Sobra por litro"
        valor={reais(i.sobra)}
        detalhe={i.receitaLitro !== null ? `recebe ${reais(i.receitaLitro)}/L` : undefined}
        comparacao={comparar("sobra", i.sobra, geral)}
      />
      <Numero rotulo="IEP médio" valor={i.iep === null ? "—" : `${fmt(i.iep)} dias`} comparacao={comparar("iep", i.iep, geral)} />
      <Numero
        rotulo="Taxa de concepção"
        valor={i.concepcao === null ? "—" : `${fmt(i.concepcao, 1)}%`}
        detalhe={i.dosesPrenhez !== null ? `${fmt(i.dosesPrenhez, 2)} doses/prenhez` : "doses do programa"}
        comparacao={comparar("concepcao", i.concepcao, geral)}
      />
    </div>
  );
}

const ORDENS: Record<string, { rotulo: string; valor: (i: Indices) => number }> = {
  nome: { rotulo: "Nome", valor: () => 0 },
  litros: { rotulo: "Mais litros por vaca", valor: (i) => -(i.litrosVaca ?? -Infinity) },
  custo: { rotulo: "Menor custo por litro", valor: (i) => i.custo ?? Infinity },
  sobra: { rotulo: "Maior sobra por litro", valor: (i) => -(i.sobra ?? -Infinity) },
  iep: { rotulo: "Menor IEP", valor: (i) => i.iep ?? Infinity },
  concepcao: { rotulo: "Maior taxa de concepção", valor: (i) => -(i.concepcao ?? -Infinity) },
};

function EntidadeModal({ entidade, onFechar, onSalvo }: { entidade: Partial<Entidade>; onFechar: () => void; onSalvo: () => void }) {
  const [state, action, pending] = useActionState(salvarEntidade, undefined);
  const [cnpj, setCnpj] = useState(entidade.cnpj ? mascaraCnpj(entidade.cnpj) : "");
  const [telefone, setTelefone] = useState(entidade.telefone ?? "");

  useEffect(() => {
    if (state?.success) queueMicrotask(onSalvo);
  }, [state, onSalvo]);

  return (
    <Modal onFechar={onFechar}>
      <form action={action} className="flex flex-col gap-4">
        {entidade.entidade_id && <input type="hidden" name="entidade_id" value={entidade.entidade_id} />}
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">
          {entidade.entidade_id ? "Editar entidade" : "Nova entidade"}
        </h2>
        <Campo id="ent_nome" label="Nome">
          <input id="ent_nome" name="nome" required defaultValue={entidade.entidade_nome ?? ""} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="ent_cnpj" label="CNPJ">
          <input
            id="ent_cnpj"
            name="cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={cnpj}
            onChange={(e) => setCnpj(mascaraCnpj(e.target.value))}
            className={CAMPO_CLASSES}
          />
        </Campo>
        <Campo id="ent_responsavel" label="Responsável">
          <input id="ent_responsavel" name="responsavel" defaultValue={entidade.responsavel ?? ""} className={CAMPO_CLASSES} />
        </Campo>
        <Campo id="ent_telefone" label="Telefone do responsável">
          <input
            id="ent_telefone"
            name="telefone"
            type="tel"
            inputMode="tel"
            placeholder="(85) 99999-9999"
            value={telefone}
            onChange={(e) => setTelefone(mascaraTelefone(e.target.value))}
            className={CAMPO_CLASSES}
          />
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

export function EntidadesClient({ entidades, fazendas }: { entidades: Entidade[]; fazendas: FazendaEntidade[] }) {
  const [ordem, setOrdem] = useState("nome");
  const [aberta, setAberta] = useState<string | null>(null);
  const [editando, setEditando] = useState<Partial<Entidade> | null>(null);
  const { mensagemToast, mostrarToast } = useSuccessToast();

  const geral = useMemo(() => (fazendas.length ? indicesGerais(fazendas) : null), [fazendas]);
  const fazendasUnicas = useMemo(() => new Set(fazendas.map((f) => f.propriedade_id)).size, [fazendas]);

  const lista = useMemo(() => {
    const criterio = ORDENS[ordem].valor;
    return entidades
      .map((e) => ({ e, i: indicesDaEntidade(e) }))
      .sort((a, b) => criterio(a.i) - criterio(b.i) || a.e.entidade_nome.localeCompare(b.e.entidade_nome, "pt-BR"));
  }, [entidades, ordem]);

  return (
    <div className="flex flex-col gap-4">
      <SuccessToast mensagem={mensagemToast} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          Ordenar por
          <select
            id="ordem_entidades"
            value={ordem}
            onChange={(e) => setOrdem(e.target.value)}
            className="rounded-md border border-black/[.08] bg-zinc-100 px-3 py-2 text-base text-black dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50"
          >
            {Object.entries(ORDENS).map(([chave, o]) => (
              <option key={chave} value={chave}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setEditando({})} className={BOTAO_PRIMARIO}>
          + Nova entidade
        </button>
      </div>

      {geral && (
        <section className={`flex flex-col gap-3 border-dashed p-4 ${CARTAO}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Média geral</h2>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {fazendasUnicas} {fazendasUnicas === 1 ? "fazenda" : "fazendas"} com entidade · referência pra comparar
            </span>
          </div>
          <GradeIndices i={geral} geral={null} />
        </section>
      )}

      {entidades.length === 0 && (
        <p className={`p-6 text-center text-zinc-600 dark:text-zinc-400 ${CARTAO}`}>
          Nenhuma entidade ainda. Cadastre em “+ Nova entidade” ou ao registrar uma entrega de doses (aba Programa).
        </p>
      )}

      {lista.map(({ e, i }) => {
        const daEntidade = fazendas.filter((f) => f.entidade_id === e.entidade_id);
        const expandida = aberta === e.entidade_id;
        return (
          <section key={e.entidade_id} className={`flex flex-col gap-3 p-4 ${CARTAO}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{e.entidade_nome}</h2>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {[e.cnpj ? `CNPJ ${mascaraCnpj(e.cnpj)}` : null, e.responsavel, e.telefone].filter(Boolean).join(" · ") ||
                    "Sem CNPJ nem responsável cadastrados"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-ranking-tint px-3 py-1 text-sm font-medium text-ranking-ink">
                  {e.fazendas} {e.fazendas === 1 ? "fazenda" : "fazendas"}
                </span>
                <button type="button" onClick={() => setEditando(e)} className="text-sm font-medium text-brand-green hover:underline">
                  Editar
                </button>
              </div>
            </div>

            {e.fazendas > 0 ? (
              <>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Média por fazenda. Verde: melhor que a média geral; vermelho: pior.
                </p>
                <GradeIndices i={i} geral={geral} />
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {e.doses_recebidas} doses recebidas ({e.kits} kits)
                  {e.doses_pendentes ? ` · ${e.doses_pendentes} a confirmar` : ""} · {e.gestacoes_em_curso} gestações em curso ·{" "}
                  {e.nascimentos} nascidos do programa
                </p>
                <button
                  type="button"
                  onClick={() => setAberta(expandida ? null : e.entidade_id)}
                  aria-expanded={expandida}
                  className="self-start text-sm font-medium text-brand-green hover:underline"
                >
                  {expandida ? "Esconder as fazendas" : "Ver as fazendas"}
                </button>
              </>
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Nenhuma fazenda ainda: a fazenda entra aqui quando recebe doses por esta entidade (aba Programa).
              </p>
            )}

            {expandida && (
              <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
                <table className="w-full min-w-[620px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                      <th className="px-3 py-2 font-medium">Fazenda</th>
                      <th className="px-3 py-2 text-right font-medium">L/vaca/dia</th>
                      <th className="px-3 py-2 text-right font-medium">Produção/dia</th>
                      <th className="px-3 py-2 text-right font-medium">Faturamento/mês</th>
                      <th className="px-3 py-2 text-right font-medium">Custo/L</th>
                      <th className="px-3 py-2 text-right font-medium">Doses (kits)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daEntidade.map((f) => (
                      <tr key={f.propriedade_id} className="border-b border-black/[.04] dark:border-white/[.06]">
                        <td className="px-3 py-2">
                          <Link href={`/gestor/fazendas/${f.propriedade_id}?de=entidades`} className="text-black hover:underline dark:text-zinc-50">
                            {f.nome_propriedade}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(n(f.litros_vaca_dia), 1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {n(f.producao_dia) === null ? "—" : `${fmt(n(f.producao_dia))} L`}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{reais(n(f.receita_mensal), 0)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{reais(n(f.custo_litro))}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {f.doses_recebidas} ({f.kits})
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      {editando && (
        <EntidadeModal
          entidade={editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null);
            mostrarToast("Entidade salva!");
          }}
        />
      )}
    </div>
  );
}
