"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type Entidade = {
  entidade_id: string;
  entidade_nome: string;
  responsavel: string | null;
  telefone: string | null;
  fazendas: number;
  vacas_lactacao: number | null;
  producao_dia: number | string | null;
  litros_vaca_dia: number | string | null;
  receita_mensal: number | string | null;
  despesa_mensal: number | string | null;
  custo_litro: number | string | null;
  receita_litro: number | string | null;
  iep_medio: number | string | null;
  doses_recebidas: number;
  doses_pendentes: number;
  kits: number;
  taxa_concepcao: number | string | null;
  doses_por_prenhez: number | string | null;
  gestacoes_em_curso: number;
  nascimentos: number;
};

export type FazendaEntidade = {
  entidade_id: string;
  propriedade_id: string;
  nome_propriedade: string;
  vacas_lactacao: number | null;
  litros_vaca_dia: number | string | null;
  producao_dia: number | string | null;
  custo_litro: number | string | null;
  receita_mensal: number | string | null;
  doses_recebidas: number;
  kits: number;
};

const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));
const fmt = (v: number | null, casas = 0) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const reais = (v: number | null, casas = 2) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: casas, maximumFractionDigits: casas });

const CARTAO = "rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]";

const ORDENS = {
  nome: { rotulo: "Nome", valor: (() => 0) as (e: Entidade) => number }, // empate: desempata pelo nome
  producao: { rotulo: "Maior produção", valor: (e: Entidade) => -(n(e.producao_dia) ?? -Infinity) },
  litros: { rotulo: "Mais litros por vaca", valor: (e: Entidade) => -(n(e.litros_vaca_dia) ?? -Infinity) },
  custo: { rotulo: "Menor custo por litro", valor: (e: Entidade) => n(e.custo_litro) ?? Infinity },
  sobra: {
    rotulo: "Maior sobra por litro",
    valor: (e: Entidade) => {
      const r = n(e.receita_litro);
      const c = n(e.custo_litro);
      return r !== null && c !== null ? -(r - c) : Infinity;
    },
  },
  concepcao: { rotulo: "Maior taxa de concepção", valor: (e: Entidade) => -(n(e.taxa_concepcao) ?? -Infinity) },
} as const;

function Numero({ rotulo, valor, detalhe, alerta }: { rotulo: string; valor: string; detalhe?: string; alerta?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{rotulo}</span>
      <span className={`font-mono text-lg font-bold tabular-nums ${alerta ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"}`}>
        {valor}
      </span>
      {detalhe && <span className="text-xs text-zinc-600 dark:text-zinc-400">{detalhe}</span>}
    </div>
  );
}

export function EntidadesClient({ entidades, fazendas }: { entidades: Entidade[]; fazendas: FazendaEntidade[] }) {
  const [ordem, setOrdem] = useState<keyof typeof ORDENS>("nome");
  const [aberta, setAberta] = useState<string | null>(null);

  const lista = useMemo(() => {
    const criterio = ORDENS[ordem].valor;
    return [...entidades].sort(
      (a, b) => criterio(a) - criterio(b) || a.entidade_nome.localeCompare(b.entidade_nome, "pt-BR"),
    );
  }, [entidades, ordem]);

  if (entidades.length === 0) {
    return (
      <p className={`p-6 text-center text-zinc-600 dark:text-zinc-400 ${CARTAO}`}>
        Nenhuma entidade ainda. Ao registrar uma entrega de doses (aba Programa) com a entidade beneficiada, ela
        aparece aqui com as fazendas que recebem por ela.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 self-start text-sm text-zinc-600 dark:text-zinc-400">
        Ordenar por
        <select
          id="ordem_entidades"
          value={ordem}
          onChange={(e) => setOrdem(e.target.value as keyof typeof ORDENS)}
          className="rounded-md border border-black/[.08] bg-zinc-100 px-3 py-2 text-base text-black dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50"
        >
          {Object.entries(ORDENS).map(([chave, o]) => (
            <option key={chave} value={chave}>
              {o.rotulo}
            </option>
          ))}
        </select>
      </label>

      {lista.map((e) => {
        const receitaLitro = n(e.receita_litro);
        const custoLitro = n(e.custo_litro);
        const sobra = receitaLitro !== null && custoLitro !== null ? receitaLitro - custoLitro : null;
        const daEntidade = fazendas.filter((f) => f.entidade_id === e.entidade_id);
        const expandida = aberta === e.entidade_id;
        return (
          <section key={e.entidade_id} className={`flex flex-col gap-3 p-4 ${CARTAO}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex min-w-0 flex-col">
                <h2 className="text-lg font-semibold text-black dark:text-zinc-50">{e.entidade_nome}</h2>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {[e.responsavel, e.telefone].filter(Boolean).join(" · ") || "Sem responsável cadastrado"}
                </span>
              </div>
              <span className="rounded-full bg-ranking-tint px-3 py-1 text-sm font-medium text-ranking-ink">
                {e.fazendas} {e.fazendas === 1 ? "fazenda" : "fazendas"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <Numero rotulo="Produção por dia" valor={n(e.producao_dia) === null ? "—" : `${fmt(n(e.producao_dia))} L`} detalhe={`${e.vacas_lactacao ?? 0} vacas em lactação`} />
              <Numero rotulo="Litros por vaca/dia" valor={fmt(n(e.litros_vaca_dia), 1)} />
              <Numero rotulo="Custo por litro" valor={reais(custoLitro)} />
              <Numero rotulo="Sobra por litro" valor={reais(sobra)} alerta={sobra !== null && sobra < 0} detalhe={receitaLitro !== null ? `receita ${reais(receitaLitro)}/L` : undefined} />
              <Numero rotulo="Receita por mês" valor={reais(n(e.receita_mensal), 0)} />
              <Numero rotulo="Despesa por mês" valor={reais(n(e.despesa_mensal), 0)} />
              <Numero rotulo="IEP médio" valor={n(e.iep_medio) === null ? "—" : `${fmt(n(e.iep_medio))} dias`} />
              <Numero
                rotulo="Doses recebidas"
                valor={fmt(e.doses_recebidas)}
                detalhe={`${e.kits} kits${e.doses_pendentes ? ` · ${e.doses_pendentes} a confirmar` : ""}`}
              />
              <Numero rotulo="Taxa de concepção" valor={n(e.taxa_concepcao) === null ? "—" : `${fmt(n(e.taxa_concepcao), 1)}%`} detalhe="só doses do programa" />
              <Numero rotulo="Doses por prenhez" valor={fmt(n(e.doses_por_prenhez), 2)} />
              <Numero rotulo="Gestações em curso" valor={fmt(e.gestacoes_em_curso)} />
              <Numero rotulo="Nascidos do programa" valor={fmt(e.nascimentos)} />
            </div>

            <button
              type="button"
              onClick={() => setAberta(expandida ? null : e.entidade_id)}
              aria-expanded={expandida}
              className="self-start text-sm font-medium text-brand-green hover:underline"
            >
              {expandida ? "Esconder as fazendas" : "Ver as fazendas"}
            </button>

            {expandida && (
              <div className="overflow-x-auto rounded-xl border border-black/[.08] dark:border-white/[.145]">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                      <th className="px-3 py-2 font-medium">Fazenda</th>
                      <th className="px-3 py-2 text-right font-medium">Vacas lact.</th>
                      <th className="px-3 py-2 text-right font-medium">L/vaca/dia</th>
                      <th className="px-3 py-2 text-right font-medium">Produção/dia</th>
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
                        <td className="px-3 py-2 text-right tabular-nums">{f.vacas_lactacao ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(n(f.litros_vaca_dia), 1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {n(f.producao_dia) === null ? "—" : `${fmt(n(f.producao_dia))} L`}
                        </td>
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
    </div>
  );
}
