"use client";

// Exibição dos alertas — o cálculo é feito no servidor (./page.tsx), com dados reais. O botão
// de WhatsApp abre conversa (wa.me) com o primeiro número ativo da fazenda em usuarios_whatsapp;
// o de documento abre o resumo da fazenda (/gestor/fazendas/[id]), que imprime ou salva em PDF.

import type { ReactNode } from "react";
import Link from "next/link";

export type NivelAlerta = "critico" | "atencao";

export type AlertaMargem = {
  id: string;
  nome: string;
  telefone: string | null;
  saldoAnterior: number;
  saldoAtual: number;
  nivel: NivelAlerta;
};

// dias = null: a fazenda nunca lançou
export type AlertaSemLancamento = {
  id: string;
  nome: string;
  telefone: string | null;
  dias: number | null;
  nivel: NivelAlerta;
};

export type AlertaReprodutivo = {
  id: string;
  nome: string;
  telefone: string | null;
  nivel: NivelAlerta;
  itens: { tipo: string; numero: number | null; dataRef: string; dias: number }[];
};

function textoItemReprodutivo(i: AlertaReprodutivo["itens"][number]) {
  const vaca = i.numero !== null ? `Vaca ${i.numero}` : "";
  switch (i.tipo) {
    case "diagnostico_atrasado":
      return `${vaca}: coberta há ${i.dias} dias, sem diagnóstico`;
    case "secagem_atrasada":
      return `${vaca}: secagem atrasada ${i.dias} dias`;
    case "parto_atrasado":
      return `${vaca}: parto previsto há ${i.dias} dias e não registrado`;
    case "vazia_muito_tempo":
      return `${vaca}: ${i.dias} dias desde o parto sem prenhez confirmada`;
    case "doses_nao_confirmadas":
      return `Doses entregues há ${i.dias} dias sem confirmação de recebimento`;
    default:
      return `${vaca} ${i.tipo}`;
  }
}

const BADGE_CLASSES: Record<NivelAlerta, string> = {
  critico: "bg-alerta-tint text-alerta-ink",
  atencao: "bg-financeiro-tint text-financeiro-ink",
};

const BADGE_LABEL: Record<NivelAlerta, string> = {
  critico: "Crítico",
  atencao: "Atenção",
};

function Badge({ nivel }: { nivel: NivelAlerta }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${BADGE_CLASSES[nivel]}`}>
      {BADGE_LABEL[nivel]}
    </span>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6.5 17.5 4 20l1-3.4A8 8 0 1 1 8 19l-1.5-1.5Z" />
      <path d="M9 9.5c.2 2.2 2.3 4.3 4.5 4.5" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="16" x2="15" y2="16" />
    </svg>
  );
}

function linkWhatsApp(telefone: string, mensagem: string) {
  return `https://wa.me/${telefone.replace(/\D/g, "")}?text=${encodeURIComponent(mensagem)}`;
}

function IconButton({
  as = "button",
  href,
  title,
  onClick,
  variant = "outline",
  children,
}: {
  as?: "button" | "a";
  href?: string;
  title: string;
  onClick?: () => void;
  variant?: "solid" | "outline";
  children: ReactNode;
}) {
  const classes = `flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
    variant === "solid"
      ? "bg-brand-green text-white hover:bg-brand-green-dark"
      : "border border-black/[.08] text-black hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
  }`;

  if (as === "a") {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={title} aria-label={title} className={classes}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} title={title} aria-label={title} className={classes}>
      {children}
    </button>
  );
}

function AcoesAlerta({
  telefone,
  mensagem,
  fazendaId,
}: {
  telefone: string | null;
  mensagem: string;
  fazendaId: string;
}) {
  return (
    <div className="flex shrink-0 gap-1.5">
      {telefone ? (
        <IconButton as="a" href={linkWhatsApp(telefone, mensagem)} title="Mandar mensagem no WhatsApp" variant="solid">
          <WhatsAppIcon className="h-4 w-4" />
        </IconButton>
      ) : (
        <span
          title="Fazenda sem WhatsApp ativo cadastrado"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-black/[.15] text-zinc-400 dark:border-white/[.2]"
        >
          <WhatsAppIcon className="h-4 w-4" />
        </span>
      )}
      <Link
        href={`/gestor/fazendas/${fazendaId}?de=alertas`}
        title="Abrir fazenda (resumo pra imprimir ou salvar em PDF)"
        aria-label="Abrir fazenda"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-black/[.08] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        <DocumentIcon className="h-4 w-4" />
      </Link>
    </div>
  );
}

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);

function textoDias(dias: number | null) {
  return dias === null ? "Nenhum lançamento registrado" : `Último lançamento há ${dias} dias`;
}

function Vazio() {
  return <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhuma fazenda nesta situação.</p>;
}

export function AlertasClient({
  reprodutivos,
  quedaMargem,
  semLancamentoLeite,
  semLancamentoFinanceiro,
  rotuloMeses,
}: {
  reprodutivos: AlertaReprodutivo[];
  quedaMargem: AlertaMargem[];
  semLancamentoLeite: AlertaSemLancamento[];
  semLancamentoFinanceiro: AlertaSemLancamento[];
  rotuloMeses: string;
}) {
  const totalAlertas =
    reprodutivos.reduce((s, a) => s + a.itens.length, 0) +
    quedaMargem.length +
    semLancamentoLeite.length +
    semLancamentoFinanceiro.length;
  const fazendasAfetadas = new Set([
    ...reprodutivos.map((a) => a.id),
    ...quedaMargem.map((a) => a.id),
    ...semLancamentoLeite.map((a) => a.id),
    ...semLancamentoFinanceiro.map((a) => a.id),
  ]).size;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-zinc-50">
          Alertas
        </h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center sm:p-5 dark:border-white/[.145]">
          <p className="font-mono text-xl font-bold tabular-nums sm:text-2xl text-black dark:text-zinc-50">
            {totalAlertas}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Alertas ativos</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center sm:p-5 dark:border-white/[.145]">
          <p className="font-mono text-xl font-bold tabular-nums sm:text-2xl text-black dark:text-zinc-50">
            {fazendasAfetadas}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Fazendas afetadas</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-reproducao" aria-hidden="true" />
          Reprodução
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Diagnóstico atrasado (+45 dias), secagem ou parto atrasados, vaca vazia há mais de 120 dias
          e doses do programa sem confirmação (+7 dias).
        </p>
        {reprodutivos.length === 0 && <Vazio />}
        <ul className="flex flex-col gap-3">
          {reprodutivos.map((a) => {
            const mensagem = `Olá! Aqui é da equipe Gestão Pec. Vimos ${a.itens.length} pendência(s) na reprodução da ${a.nome} (como diagnóstico de prenhez ou secagem). Podemos ajudar a colocar em dia?`;
            return (
              <li key={a.id} className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black dark:text-zinc-50">{a.nome}</p>
                    <ul className="mt-1 flex flex-col gap-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                      {a.itens.slice(0, 6).map((i, idx) => (
                        <li key={idx}>{textoItemReprodutivo(i)}</li>
                      ))}
                      {a.itens.length > 6 && <li>e mais {a.itens.length - 6}…</li>}
                    </ul>
                    <div className="mt-2">
                      <Badge nivel={a.nivel} />
                    </div>
                  </div>
                  <AcoesAlerta telefone={a.telefone} mensagem={mensagem} fazendaId={a.id} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-alerta" aria-hidden="true" />
          Queda de margem &gt; 20% ({rotuloMeses})
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Saldo (receita − despesa) dos dois últimos meses fechados.
        </p>
        {quedaMargem.length === 0 && <Vazio />}
        <ul className="flex flex-col gap-3">
          {quedaMargem.map((a) => {
            const variacao = ((a.saldoAtual - a.saldoAnterior) / a.saldoAnterior) * 100;
            const mensagem = `Olá! Aqui é da equipe Gestão Pec. Notamos uma queda de ${Math.abs(Math.round(variacao))}% no saldo da ${a.nome} esse mês e queríamos entender melhor o que houve — podemos conversar?`;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black dark:text-zinc-50">{a.nome}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {formatarMoeda(a.saldoAnterior)} → {formatarMoeda(a.saldoAtual)}{" "}
                      <span className="font-mono tabular-nums text-red-600 dark:text-red-400">
                        ({Math.round(variacao)}%)
                      </span>
                    </p>
                    <div className="mt-2">
                      <Badge nivel={a.nivel} />
                    </div>
                  </div>
                  <AcoesAlerta telefone={a.telefone} mensagem={mensagem} fazendaId={a.id} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-leite" aria-hidden="true" />
          Sem lançamento de leite há mais de 7 dias
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Fazendas com vacas em lactação.</p>
        {semLancamentoLeite.length === 0 && <Vazio />}
        <ul className="flex flex-col gap-3">
          {semLancamentoLeite.map((a) => {
            const mensagem =
              a.dias === null
                ? `Olá! Notamos que a ${a.nome} ainda não lançou nenhum controle de leite. Podemos ajudar a começar?`
                : `Olá! Notamos que não há lançamento de leite da ${a.nome} há ${a.dias} dias. Está tudo bem por aí? Precisa de ajuda?`;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black dark:text-zinc-50">{a.nome}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{textoDias(a.dias)}</p>
                    <div className="mt-2">
                      <Badge nivel={a.nivel} />
                    </div>
                  </div>
                  <AcoesAlerta telefone={a.telefone} mensagem={mensagem} fazendaId={a.id} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-financeiro" aria-hidden="true" />
          Sem lançamento financeiro há mais de 7 dias
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Receitas e despesas.</p>
        {semLancamentoFinanceiro.length === 0 && <Vazio />}
        <ul className="flex flex-col gap-3">
          {semLancamentoFinanceiro.map((a) => {
            const mensagem =
              a.dias === null
                ? `Olá! Notamos que a ${a.nome} ainda não lançou receitas e despesas. Podemos ajudar a começar?`
                : `Olá! Notamos que não há lançamento financeiro da ${a.nome} há ${a.dias} dias. Precisa de ajuda pra registrar?`;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black dark:text-zinc-50">{a.nome}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">{textoDias(a.dias)}</p>
                    <div className="mt-2">
                      <Badge nivel={a.nivel} />
                    </div>
                  </div>
                  <AcoesAlerta telefone={a.telefone} mensagem={mensagem} fazendaId={a.id} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
