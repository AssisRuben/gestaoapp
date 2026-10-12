import type { Indicadores, IndicadoresFazenda } from "@/lib/indicadores-fazenda";
import { formatarDataBR } from "./(app)/format";

// Índices da fazenda (custo por litro, receita, sobra; comparação com a adesão ao programa; índices
// reprodutivos do programa) — Início do produtor, relatório da visita e resumo do gestor. Server
// component. Mesma régua do ranking do gestor (calcular_indicadores).

const CARTAO = "rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145] print:break-inside-avoid print:border-black/20";

const litros = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L`;
const litrosVaca = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const centavos = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Campo = {
  chave: keyof Indicadores;
  rotulo: string;
  formato: (v: number) => string;
  detalhe: string;
  menorMelhor?: boolean;
};

const PRODUCAO: Campo[] = [
  { chave: "litrosVacaDia", rotulo: "Litros por vaca/dia", formato: litrosVaca, detalhe: "média das vacas pesadas nos últimos 30 dias" },
  { chave: "producaoDia", rotulo: "Produção por dia", formato: litros, detalhe: "L/vaca/dia × vacas em lactação" },
];

const DINHEIRO: Campo[] = [
  { chave: "receitaMensal", rotulo: "Receita por mês", formato: reais, detalhe: "média dos meses com lançamento (12 meses)" },
  { chave: "despesaMensal", rotulo: "Despesa por mês", formato: reais, detalhe: "média dos meses com lançamento (12 meses)", menorMelhor: true },
  { chave: "custoLitro", rotulo: "Custo por litro", formato: centavos, detalhe: "despesa do mês ÷ litros do mês", menorMelhor: true },
  { chave: "receitaLitro", rotulo: "Receita por litro", formato: centavos, detalhe: "receita do mês ÷ litros do mês" },
  { chave: "sobraLitro", rotulo: "Sobra por litro", formato: centavos, detalhe: "receita por litro − custo por litro" },
];

function Cartao({ campo, hoje, adesao }: { campo: Campo; hoje: Indicadores; adesao: IndicadoresFazenda["adesao"] }) {
  const valor = hoje[campo.chave];
  const antes = adesao ? adesao[campo.chave] : null;
  const diferenca = valor !== null && antes !== null ? valor - antes : null;
  const melhorou = diferenca === null || diferenca === 0 ? null : campo.menorMelhor ? diferenca < 0 : diferenca > 0;
  const negativo = campo.chave === "sobraLitro" && valor !== null && valor < 0;

  return (
    <div className={`flex flex-col gap-0.5 p-3 sm:p-4 ${CARTAO}`}>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{campo.rotulo}</span>
      <span
        className={`font-mono text-xl font-bold tabular-nums sm:text-2xl ${
          negativo ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"
        }`}
      >
        {valor === null ? "—" : campo.formato(valor)}
      </span>
      <span className="text-xs text-zinc-600 dark:text-zinc-400">{campo.detalhe}</span>
      {adesao && antes !== null && (
        <span className="text-xs text-zinc-600 dark:text-zinc-400">
          Na adesão: {campo.formato(antes)}
          {melhorou !== null && diferenca !== null && (
            <span className={melhorou ? " font-medium text-brand-green" : " font-medium text-red-600 dark:text-red-400"}>
              {" "}
              {diferenca > 0 ? "▲" : "▼"} {campo.formato(Math.abs(diferenca))}
            </span>
          )}
        </span>
      )}
    </div>
  );
}

export function IndicadoresFazendaView({
  indicadores,
  mostrarProducao = true,
}: {
  indicadores: IndicadoresFazenda;
  mostrarProducao?: boolean; // o resumo da fazenda já mostra produção/dia e L/vaca/dia em cima
}) {
  const { hoje, adesao, programa } = indicadores;
  const campos = mostrarProducao ? [...PRODUCAO, ...DINHEIRO] : DINHEIRO;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-black dark:text-zinc-50">Índices da fazenda</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Saem do leite pesado e do financeiro lançado. Quanto mais completo o lançamento, mais certo o número.
          {adesao && ` Comparação com a adesão ao programa em ${formatarDataBR(adesao.data)}.`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 print:grid-cols-3">
        {campos.map((c) => (
          <Cartao key={c.chave} campo={c} hoje={hoje} adesao={adesao} />
        ))}
      </div>
      {hoje.custoLitro === null && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          O custo por litro aparece quando há pesagem de leite nos últimos 30 dias e despesas lançadas.
        </p>
      )}

      {programa && (
        <>
          <h3 className="mt-2 text-sm font-semibold text-black dark:text-zinc-50">Programa de sêmen</h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 print:grid-cols-4">
            <div className={`flex flex-col gap-0.5 p-3 ${CARTAO}`}>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Taxa de concepção</span>
              <span className="font-mono text-xl font-bold tabular-nums text-black dark:text-zinc-50">
                {programa.taxaConcepcao === null ? "—" : `${programa.taxaConcepcao.toLocaleString("pt-BR")}%`}
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">prenhes ÷ diagnosticadas</span>
            </div>
            <div className={`flex flex-col gap-0.5 p-3 ${CARTAO}`}>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Doses por prenhez</span>
              <span className="font-mono text-xl font-bold tabular-nums text-black dark:text-zinc-50">
                {programa.dosesPorPrenhez === null ? "—" : programa.dosesPorPrenhez.toLocaleString("pt-BR")}
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{programa.dosesUsadas} doses usadas</span>
            </div>
            <div className={`flex flex-col gap-0.5 p-3 ${CARTAO}`}>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Gestações em curso</span>
              <span className="font-mono text-xl font-bold tabular-nums text-black dark:text-zinc-50">{programa.gestacoesEmCurso}</span>
            </div>
            <div className={`flex flex-col gap-0.5 p-3 ${CARTAO}`}>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Nascidos do programa</span>
              <span className="font-mono text-xl font-bold tabular-nums text-black dark:text-zinc-50">{programa.nascimentos}</span>
              <span className="text-xs text-zinc-600 dark:text-zinc-400">{programa.femeas} fêmeas</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
