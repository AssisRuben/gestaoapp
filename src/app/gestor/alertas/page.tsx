"use client";

// Dados fictícios estáticos só pra desenhar a tela — nenhuma chamada ao Supabase aqui ainda.
// Os 3 alertas abaixo são só os que dependem de fato (comparação de saldo mês a mês e "sem
// lançamento há N dias") — "fluxo de caixa negativo previsto" fica de fora por depender de uma
// regra de projeção que ainda não foi definida. O botão de WhatsApp já monta um link real
// (wa.me) com telefone fictício; o de relatório em PDF só mostra um aviso por enquanto — a
// geração do relatório em si fica pra depois.

import type { ReactNode } from "react";
import { useSuccessToast, SuccessToast } from "../../(app)/toast";

type NivelAlerta = "critico" | "atencao";

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
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
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
  onPdf,
  onPdfWhatsApp,
}: {
  telefone: string;
  mensagem: string;
  onPdf: () => void;
  onPdfWhatsApp: () => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5">
      <IconButton as="a" href={linkWhatsApp(telefone, mensagem)} title="Mandar mensagem no WhatsApp" variant="solid">
        <WhatsAppIcon className="h-4 w-4" />
      </IconButton>
      <IconButton title="Relatório em PDF" onClick={onPdf}>
        <DocumentIcon className="h-4 w-4" />
      </IconButton>
      <IconButton title="Enviar relatório em PDF pelo WhatsApp" onClick={onPdfWhatsApp}>
        <span className="relative flex h-4 w-4 items-center justify-center">
          <DocumentIcon className="h-4 w-4" />
          <span className="absolute -bottom-1 -right-1.5 flex h-3 w-3 items-center justify-center rounded-full bg-brand-green text-white">
            <WhatsAppIcon className="h-2 w-2" />
          </span>
        </span>
      </IconButton>
    </div>
  );
}

const QUEDA_MARGEM = [
  {
    id: "1",
    nome: "Fazenda Água Fria",
    telefone: "5588991234004",
    saldoAnterior: 8200,
    saldoAtual: 5100,
    nivel: "critico" as NivelAlerta,
  },
  {
    id: "2",
    nome: "Fazenda Serra Bonita",
    telefone: "5588991234008",
    saldoAnterior: 3400,
    saldoAtual: 2500,
    nivel: "atencao" as NivelAlerta,
  },
  {
    id: "3",
    nome: "Fazenda Santa Luzia",
    telefone: "5588991234006",
    saldoAnterior: 4000,
    saldoAtual: 3100,
    nivel: "atencao" as NivelAlerta,
  },
];

const SEM_LANCAMENTO_LEITE = [
  { id: "1", nome: "Sítio Nova Esperança", telefone: "5588991234005", dias: 12, nivel: "critico" as NivelAlerta },
  { id: "2", nome: "Fazenda Serra Bonita", telefone: "5588991234008", dias: 9, nivel: "atencao" as NivelAlerta },
];

const SEM_LANCAMENTO_FINANCEIRO = [
  { id: "1", nome: "Fazenda Vale do Sol", telefone: "5588991234007", dias: 15, nivel: "critico" as NivelAlerta },
  { id: "2", nome: "Sítio Três Irmãos", telefone: "5588991234002", dias: 8, nivel: "atencao" as NivelAlerta },
];

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(valor);

const totalAlertas = QUEDA_MARGEM.length + SEM_LANCAMENTO_LEITE.length + SEM_LANCAMENTO_FINANCEIRO.length;
const fazendasAfetadas = new Set([
  ...QUEDA_MARGEM.map((a) => a.nome),
  ...SEM_LANCAMENTO_LEITE.map((a) => a.nome),
  ...SEM_LANCAMENTO_FINANCEIRO.map((a) => a.nome),
]).size;

export default function GestorAlertasPage() {
  const { mensagemToast, mostrarToast } = useSuccessToast();
  const onPdf = () => mostrarToast("Relatório em PDF — em breve");
  const onPdfWhatsApp = () => mostrarToast("Envio do relatório em PDF pelo WhatsApp — em breve");

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <SuccessToast mensagem={mensagemToast} />

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
          <span className="h-2.5 w-2.5 rounded-full bg-alerta" aria-hidden="true" />
          Queda de margem &gt; 20% (mês atual vs. anterior)
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Comparação do saldo (receita − despesa) mês a mês.</p>
        <ul className="flex flex-col gap-3">
          {QUEDA_MARGEM.map((a) => {
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
                  <AcoesAlerta telefone={a.telefone} mensagem={mensagem} onPdf={onPdf} onPdfWhatsApp={onPdfWhatsApp} />
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
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Última data em `controle_leite` por fazenda.</p>
        <ul className="flex flex-col gap-3">
          {SEM_LANCAMENTO_LEITE.map((a) => {
            const mensagem = `Olá! Notamos que não há lançamento de leite da ${a.nome} há ${a.dias} dias. Está tudo bem por aí? Precisa de ajuda?`;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black dark:text-zinc-50">{a.nome}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Último lançamento há {a.dias} dias</p>
                    <div className="mt-2">
                      <Badge nivel={a.nivel} />
                    </div>
                  </div>
                  <AcoesAlerta telefone={a.telefone} mensagem={mensagem} onPdf={onPdf} onPdfWhatsApp={onPdfWhatsApp} />
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
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Última data em `financeiro` por fazenda.</p>
        <ul className="flex flex-col gap-3">
          {SEM_LANCAMENTO_FINANCEIRO.map((a) => {
            const mensagem = `Olá! Notamos que não há lançamento financeiro da ${a.nome} há ${a.dias} dias. Precisa de ajuda pra registrar?`;
            return (
              <li
                key={a.id}
                className="flex flex-col gap-3 rounded-xl border border-black/[.08] p-3 dark:border-white/[.145]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-black dark:text-zinc-50">{a.nome}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">Último lançamento há {a.dias} dias</p>
                    <div className="mt-2">
                      <Badge nivel={a.nivel} />
                    </div>
                  </div>
                  <AcoesAlerta telefone={a.telefone} mensagem={mensagem} onPdf={onPdf} onPdfWhatsApp={onPdfWhatsApp} />
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
