"use client";

// Dados fictícios estáticos só pra desenhar a tela — nenhuma chamada ao Supabase aqui ainda.
// O dado real viria de `interacoes_log` (gravada pelo bot do WhatsApp, o site nunca leu essa
// tabela até hoje): intencao_detectada, mensagem_recebida, propriedade_id, created_at.
// Todos os números da tela (totais, ranking de intenções, tabela recente) são derivados de uma
// única lista de interações — filtrando por fazenda ela recalcula tudo, em vez de manter dois
// conjuntos de números que podem ficar inconsistentes entre si.

import { useMemo, useState } from "react";
import { BarRanking } from "../bar-ranking";

const INTENCAO_LABEL: Record<string, string> = {
  registrar_leite: "Registrar leite",
  consultar_financeiro: "Consultar financeiro",
  registrar_financeiro: "Registrar financeiro",
  diagnostico_prenhez: "Diagnóstico de prenhez",
  registrar_cobertura: "Registrar cobertura",
  registrar_parto: "Registrar parto",
  duvida_geral: "Dúvida geral / não entendida",
};

type Interacao = {
  id: string;
  fazenda: string;
  intencao: string;
  mensagem: string;
  quando: string;
  ordem: number;
};

// `ordem` maior = mais recente, só pra ordenar a tabela sem precisar de datas reais.
const INTERACOES: Interacao[] = [
  { id: "1", fazenda: "Fazenda Boa Vista", intencao: "registrar_leite", mensagem: "vaca 42 deu 18 litros hoje de manha", quando: "20/07 08:14", ordem: 43 },
  { id: "2", fazenda: "Sítio Nova Esperança", intencao: "duvida_geral", mensagem: "como eu faco pra ver quanto gastei esse mes", quando: "20/07 07:52", ordem: 42 },
  { id: "3", fazenda: "Fazenda Água Fria", intencao: "diagnostico_prenhez", mensagem: "a vaca 17 confirmou prenhe", quando: "19/07 18:03", ordem: 41 },
  { id: "4", fazenda: "Fazenda Serra Bonita", intencao: "duvida_geral", mensagem: "nao entendi o que vc quis dizer, pode explicar de novo?", quando: "19/07 16:41", ordem: 40 },
  { id: "5", fazenda: "Fazenda Recanto Verde", intencao: "registrar_financeiro", mensagem: "gastei 450 com racao hoje", quando: "19/07 14:20", ordem: 39 },
  { id: "6", fazenda: "Fazenda Vale do Sol", intencao: "consultar_financeiro", mensagem: "quanto ta o saldo desse mes", quando: "19/07 09:37", ordem: 38 },
  { id: "7", fazenda: "Fazenda Boa Vista", intencao: "registrar_leite", mensagem: "vaca 12 deu 21 litros", quando: "19/07 08:05", ordem: 37 },
  { id: "8", fazenda: "Fazenda Água Fria", intencao: "duvida_geral", mensagem: "e o que eu faço agora?", quando: "18/07 19:12", ordem: 36 },
  { id: "9", fazenda: "Sítio Três Irmãos", intencao: "registrar_cobertura", mensagem: "cobri a vaca 8 hoje de manha", quando: "18/07 10:44", ordem: 35 },
  { id: "10", fazenda: "Fazenda Santa Luzia", intencao: "duvida_geral", mensagem: "nao consigo entender como registrar", quando: "18/07 09:30", ordem: 34 },
  { id: "11", fazenda: "Fazenda Boa Vista", intencao: "consultar_financeiro", mensagem: "quanto eu ja gastei esse mes", quando: "17/07 17:55", ordem: 33 },
  { id: "12", fazenda: "Fazenda Recanto Verde", intencao: "registrar_leite", mensagem: "vaca 5 deu 15 litros a tarde", quando: "17/07 15:10", ordem: 32 },
  { id: "13", fazenda: "Sítio Nova Esperança", intencao: "consultar_financeiro", mensagem: "qual foi meu saldo do mes passado", quando: "17/07 11:22", ordem: 31 },
  { id: "14", fazenda: "Fazenda Vale do Sol", intencao: "registrar_leite", mensagem: "vaca 30 deu 19 litros", quando: "17/07 08:02", ordem: 30 },
  { id: "15", fazenda: "Fazenda Água Fria", intencao: "registrar_leite", mensagem: "vaca 9 deu 16 litros hoje", quando: "16/07 08:20", ordem: 29 },
  { id: "16", fazenda: "Fazenda Serra Bonita", intencao: "registrar_leite", mensagem: "vaca 3 deu 14 litros", quando: "16/07 07:48", ordem: 28 },
  { id: "17", fazenda: "Sítio Três Irmãos", intencao: "registrar_financeiro", mensagem: "vendi um bezerro por 1200", quando: "15/07 16:33", ordem: 27 },
  { id: "18", fazenda: "Fazenda Recanto Verde", intencao: "registrar_parto", mensagem: "a vaca 21 pariu hoje, femea", quando: "15/07 12:15", ordem: 26 },
  { id: "19", fazenda: "Fazenda Santa Luzia", intencao: "registrar_financeiro", mensagem: "paguei o veterinario 300", quando: "15/07 09:40", ordem: 25 },
  { id: "20", fazenda: "Sítio Nova Esperança", intencao: "duvida_geral", mensagem: "isso conta como despesa ou receita?", quando: "14/07 18:27", ordem: 24 },
  { id: "21", fazenda: "Fazenda Vale do Sol", intencao: "registrar_cobertura", mensagem: "cobri a vaca 11 ontem", quando: "14/07 10:05", ordem: 23 },
  { id: "22", fazenda: "Fazenda Boa Vista", intencao: "registrar_financeiro", mensagem: "comprei racao, gastei 800", quando: "14/07 08:50", ordem: 22 },
  { id: "23", fazenda: "Fazenda Serra Bonita", intencao: "consultar_financeiro", mensagem: "quanto sobrou esse mes", quando: "13/07 17:02", ordem: 21 },
  { id: "24", fazenda: "Sítio Três Irmãos", intencao: "duvida_geral", mensagem: "num intendi kkk pode falar de novo", quando: "13/07 15:48", ordem: 20 },
  { id: "25", fazenda: "Fazenda Recanto Verde", intencao: "consultar_financeiro", mensagem: "qual foi o saldo dessa semana", quando: "13/07 11:30", ordem: 19 },
  { id: "26", fazenda: "Fazenda Boa Vista", intencao: "registrar_leite", mensagem: "vaca 42 deu 17 litros", quando: "13/07 08:10", ordem: 18 },
  { id: "27", fazenda: "Fazenda Água Fria", intencao: "consultar_financeiro", mensagem: "quanto ja recebi de leite esse mes", quando: "12/07 14:44", ordem: 17 },
  { id: "28", fazenda: "Fazenda Serra Bonita", intencao: "duvida_geral", mensagem: "pera, como assim? nao entendi essa parte", quando: "12/07 12:19", ordem: 16 },
  { id: "29", fazenda: "Fazenda Boa Vista", intencao: "registrar_leite", mensagem: "vaca 12 deu 20 litros hoje", quando: "12/07 08:00", ordem: 15 },
  { id: "30", fazenda: "Fazenda Vale do Sol", intencao: "consultar_financeiro", mensagem: "resumo do financeiro por favor", quando: "11/07 16:12", ordem: 14 },
  { id: "31", fazenda: "Fazenda Boa Vista", intencao: "diagnostico_prenhez", mensagem: "vaca 25 confirmou prenhez hoje", quando: "11/07 09:25", ordem: 13 },
  { id: "32", fazenda: "Sítio Nova Esperança", intencao: "registrar_leite", mensagem: "vaca 6 deu 13 litros", quando: "10/07 08:40", ordem: 12 },
  { id: "33", fazenda: "Fazenda Santa Luzia", intencao: "registrar_leite", mensagem: "vaca 14 deu 12 litros hoje", quando: "10/07 07:58", ordem: 11 },
  { id: "34", fazenda: "Fazenda Água Fria", intencao: "registrar_leite", mensagem: "vaca 9 deu 15 litros", quando: "09/07 08:15", ordem: 10 },
];

const FAZENDAS = [
  "Fazenda Boa Vista",
  "Sítio Três Irmãos",
  "Fazenda Recanto Verde",
  "Fazenda Água Fria",
  "Sítio Nova Esperança",
  "Fazenda Santa Luzia",
  "Fazenda Vale do Sol",
  "Fazenda Serra Bonita",
];

const CAMPO_CLASSES =
  "rounded-md border border-black/[.08] bg-zinc-100 px-4 py-2.5 text-base text-black outline-none focus:border-black/40 dark:border-white/[.145] dark:bg-white/[.08] dark:text-zinc-50 dark:focus:border-white/40";

export default function GestorAgentePage() {
  const [fazendaFiltro, setFazendaFiltro] = useState("todas");

  const interacoesFiltradas = useMemo(
    () =>
      fazendaFiltro === "todas"
        ? INTERACOES
        : INTERACOES.filter((i) => i.fazenda === fazendaFiltro),
    [fazendaFiltro],
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
        destaque: intencao === "duvida_geral" ? "sinal de confusão" : undefined,
      }));
  }, [interacoesFiltradas]);

  const totalDuvidas = porIntencao.find((i) => i.id === "duvida_geral")?.valor ?? 0;
  const pctDuvidas = total > 0 ? Math.round((totalDuvidas / total) * 100) : 0;

  const fazendasComDuvida = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of INTERACOES) {
      if (i.intencao !== "duvida_geral") continue;
      mapa.set(i.fazenda, (mapa.get(i.fazenda) ?? 0) + 1);
    }
    return [...mapa.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([fazenda, valor]) => ({ id: fazenda, label: fazenda, valor, formatado: `${valor}` }));
  }, []);

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
        <p className="text-zinc-600 dark:text-zinc-400">Período: 09 a 20 de julho de 2026</p>
      </div>

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
          {FAZENDAS.map((f) => (
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
            das mensagens são dúvida/não reconhecida
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
