"use client";

// Exibição — os dados vêm de `interacoes_log` (./page.tsx). Quem grava essa tabela é o bot do
// WhatsApp (nó "Registrar Interação (Log)") e o workflow de erro.
// Todos os números da tela (totais, ranking de intenções, tabela recente) são derivados de uma
// única lista de interações — filtrando por fazenda ela recalcula tudo, em vez de manter dois
// conjuntos de números que podem ficar inconsistentes entre si.

import { useMemo, useState } from "react";
import { BarRanking } from "../bar-ranking";

const INTENCAO_LABEL: Record<string, string> = {
  registrar_leite: "Registrar leite",
  registrar_parto: "Registrar parto",
  registrar_cobertura: "Registrar cobertura",
  diagnosticar_prenhez: "Diagnóstico de prenhez",
  cadastrar_vaca: "Cadastrar vaca",
  atualizar_vaca: "Atualizar vaca",
  consultar_vaca: "Consultar vaca",
  consultar_relatorio: "Consultar relatório",
  atualizar_registro: "Corrigir leite",
  deletar_registro: "Apagar leite",
  registrar_financeiro: "Registrar financeiro",
  consultar_financeiro: "Consultar financeiro",
  atualizar_financeiro: "Corrigir financeiro",
  deletar_financeiro: "Apagar financeiro",
  outro: "Não entendida",
  // gravada pelo nó "Registrar Interação (Log)" quando a mensagem é o SIM/NÃO de uma exclusão
  confirmacao_exclusao: "Confirmação de exclusão",
  // gravada pelo workflow de erro (fazenda-leite-erros.json) quando uma execução falha; a
  // "mensagem" é o nó que falhou e o erro
  erro: "Erro no sistema",
  // gravada pelo workflow de lembretes diários (fazenda-leite-lembretes.json)
  lembrete: "Lembrete enviado",
};

// "outro" é o que o classificador devolve quando não reconhece o pedido
const NAO_ENTENDIDA = "outro";

export type Interacao = {
  id: string;
  fazenda: string;
  intencao: string;
  mensagem: string;
  quando: string;
  ordem: number;
};

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";

export function AgenteClient({
  interacoes,
  fazendas,
  periodo,
}: {
  interacoes: Interacao[];
  fazendas: string[];
  periodo: string;
}) {
  const [fazendaFiltro, setFazendaFiltro] = useState("todas");

  const interacoesFiltradas = useMemo(
    () =>
      fazendaFiltro === "todas"
        ? interacoes
        : interacoes.filter((i) => i.fazenda === fazendaFiltro),
    [interacoes, fazendaFiltro],
  );

  const total = interacoesFiltradas.length;

  const porIntencao = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of interacoesFiltradas) {
      mapa.set(i.intencao, (mapa.get(i.intencao) ?? 0) + 1);
    }
    return [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([intencao, valor]) => ({
        id: intencao,
        label: INTENCAO_LABEL[intencao] ?? intencao,
        valor,
        formatado: `${valor}`,
        destaque: intencao === NAO_ENTENDIDA ? "sinal de confusão" : undefined,
      }));
  }, [interacoesFiltradas]);

  const totalDuvidas = porIntencao.find((i) => i.id === NAO_ENTENDIDA)?.valor ?? 0;
  const pctDuvidas = total > 0 ? Math.round((totalDuvidas / total) * 100) : 0;

  const fazendasComDuvida = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of interacoes) {
      if (i.intencao !== NAO_ENTENDIDA) continue;
      mapa.set(i.fazenda, (mapa.get(i.fazenda) ?? 0) + 1);
    }
    return [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fazenda, valor]) => ({ id: fazenda, label: fazenda, valor, formatado: `${valor}` }));
  }, [interacoes]);

  const logRecente = useMemo(
    () => [...interacoesFiltradas].sort((a, b) => b.ordem - a.ordem).slice(0, 8),
    [interacoesFiltradas],
  );

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-zinc-50">
          Engajamento com o Agente
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">Período: {periodo}</p>
      </div>

      {interacoes.length === 0 && (
        <p className="rounded-2xl bg-financeiro-tint p-4 text-sm text-financeiro-ink">
          Nenhuma mensagem do WhatsApp registrada no período. O bot ainda precisa gravar cada
          mensagem recebida na tabela <code>interacoes_log</code> — sem isso esta tela fica vazia.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="agente_fazenda" className="text-base font-medium text-black dark:text-zinc-50">
          Fazenda
        </label>
        <select
          id="agente_fazenda"
          value={fazendaFiltro}
          onChange={(e) => setFazendaFiltro(e.target.value)}
          className={CAMPO_CLASSES}
        >
          <option value="todas">Todas as fazendas</option>
          {fazendas.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center sm:p-5 dark:border-white/[.145]">
          <p className="font-mono text-xl font-bold tabular-nums sm:text-2xl text-black dark:text-zinc-50">
            {total}
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">Interações no período</p>
        </div>
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 text-center sm:p-5 dark:border-white/[.145]">
          <p className="font-mono text-xl font-bold tabular-nums sm:text-2xl text-black dark:text-zinc-50">
            {pctDuvidas}%
          </p>
          <p className="text-base text-zinc-600 dark:text-zinc-400">
            das mensagens não foram entendidas
          </p>
        </div>
      </div>

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
          <span className="h-2.5 w-2.5 rounded-full bg-agente" aria-hidden="true" />
          Intenções mais frequentes
        </p>
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          Agrupado por `interacoes_log.intencao_detectada`
          {fazendaFiltro !== "todas" ? ` — ${fazendaFiltro}` : " no período"}.
        </p>
        <BarRanking itens={porIntencao} corClass="bg-agente" fundoClass="bg-agente-tint" />
      </div>

      {fazendaFiltro === "todas" && (
        <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
          <p className="mb-1 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
            <span className="h-2.5 w-2.5 rounded-full bg-alerta" aria-hidden="true" />
            Fazendas com mais dúvidas
          </p>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Produtores que ainda não entenderam bem o fluxo do agente.
          </p>
          <BarRanking itens={fazendasComDuvida} corClass="bg-alerta" fundoClass="bg-alerta-tint" showRank />
        </div>
      )}

      <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
        <p className="mb-3 text-base font-semibold text-black dark:text-zinc-50">
          Interações recentes{fazendaFiltro !== "todas" ? ` — ${fazendaFiltro}` : ""}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                {fazendaFiltro === "todas" && <th className="py-2 pr-3 font-medium">Fazenda</th>}
                <th className="py-2 pr-3 font-medium">Intenção</th>
                <th className="py-2 pr-3 font-medium">Mensagem</th>
                <th className="py-2 font-medium">Quando</th>
              </tr>
            </thead>
            <tbody>
              {logRecente.map((log) => (
                <tr key={log.id} className="border-b border-black/[.08] last:border-0 dark:border-white/[.145]">
                  {fazendaFiltro === "todas" && (
                    <td className="py-2 pr-3 whitespace-nowrap text-black dark:text-zinc-50">{log.fazenda}</td>
                  )}
                  <td className="py-2 pr-3 whitespace-nowrap text-black dark:text-zinc-50">
                    {INTENCAO_LABEL[log.intencao] ?? log.intencao}
                  </td>
                  <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">{log.mensagem}</td>
                  <td className="py-2 whitespace-nowrap font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                    {log.quando}
                  </td>
                </tr>
              ))}
              {logRecente.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-zinc-600 dark:text-zinc-400">
                    Nenhuma interação nesse período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
