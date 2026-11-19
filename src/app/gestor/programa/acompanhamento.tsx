import { formatarDataBR } from "../../(app)/format";
import { EmptyCard } from "../../(app)/mobile-list";
import { DIAS_ALERTA_BOTIJAO, type BotijaoSituacao } from "@/lib/programa";
import { EvolucaoMensal, type MesInseminacoes } from "./evolucao-mensal";

// Acompanhamento das ações do programa (0064): evolução das inseminações por mês e situação do
// botijão de nitrogênio de cada fazenda.

function Indicador({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: React.ReactNode; detalhe?: string; destaque?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-2xl border p-4 ${
        destaque ? "border-alerta/40 bg-alerta-tint" : "border-black/[.08] bg-surface dark:border-white/[.145]"
      }`}
    >
      <span className={`text-sm ${destaque ? "text-alerta-ink" : "text-zinc-600 dark:text-zinc-400"}`}>{rotulo}</span>
      <span className={`text-2xl font-bold ${destaque ? "text-alerta-ink" : "text-black dark:text-zinc-50"}`}>{valor}</span>
      {detalhe && <span className="text-xs text-zinc-600 dark:text-zinc-400">{detalhe}</span>}
    </div>
  );
}

const moeda = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

export function EvolucaoSecao({ meses, vacasPrenhes }: { meses: MesInseminacoes[]; vacasPrenhes: number }) {
  const soma = (k: keyof Omit<MesInseminacoes, "mes">) => meses.reduce((t, m) => t + m[k], 0);
  const inseminacoes = soma("prenhezes") + soma("negativos") + soma("pendentes");
  const ultimos3 = meses.slice(-3).reduce((t, m) => t + m.prenhezes + m.negativos + m.pendentes, 0);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Evolução das inseminações</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Inseminações com dose do programa nos últimos 12 meses, pelo mês da cobertura e pelo resultado.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador rotulo="Inseminações em 12 meses" valor={inseminacoes} detalhe={`${ultimos3} nos últimos 3 meses`} />
        <Indicador rotulo="Prenhezes confirmadas em 12 meses" valor={soma("prenhezes")} detalhe={`${soma("pendentes")} aguardando diagnóstico`} />
        <Indicador rotulo="Vacas prenhes agora" valor={vacasPrenhes} detalhe="todo o rebanho das fazendas do programa" />
      </div>
      {inseminacoes === 0 ? (
        <EmptyCard>Nenhuma inseminação com dose do programa nos últimos 12 meses.</EmptyCard>
      ) : (
        <div className="rounded-2xl border border-black/[.08] bg-surface p-4 dark:border-white/[.145]">
          <EvolucaoMensal meses={meses} />
        </div>
      )}
    </section>
  );
}

export type LinhaBotijao = { id: string; nome: string; situacao: BotijaoSituacao | null };

export function BotijaoSecao({ linhas }: { linhas: LinhaBotijao[] }) {
  const comRegistro = linhas.filter((l) => l.situacao);
  const atrasados = comRegistro.filter((l) => l.situacao!.dias_desde > DIAS_ALERTA_BOTIJAO);
  const gasto = comRegistro.reduce((t, l) => t + Number(l.situacao!.gasto_12m), 0);
  // atrasados primeiro (mais dias antes), depois em dia, e por fim quem nunca registrou
  const ordenadas = [...linhas].sort((a, b) => {
    if (!a.situacao || !b.situacao) return a.situacao ? -1 : b.situacao ? 1 : a.nome.localeCompare(b.nome, "pt-BR");
    return b.situacao.dias_desde - a.situacao.dias_desde;
  });

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Botijão de nitrogênio</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Último abastecimento registrado por cada fazenda. Mais de {DIAS_ALERTA_BOTIJAO} dias sem abastecer entra
          nos Alertas.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador
          rotulo={`Sem abastecer há +${DIAS_ALERTA_BOTIJAO} dias`}
          valor={atrasados.length}
          detalhe={`de ${comRegistro.length} com abastecimento registrado`}
          destaque={atrasados.length > 0}
        />
        <Indicador rotulo="Gasto com nitrogênio em 12 meses" valor={moeda(gasto)} />
        <Indicador
          rotulo="Sem nenhum registro"
          valor={linhas.length - comRegistro.length}
          detalhe="fazendas do programa que nunca registraram"
        />
      </div>
      {linhas.length === 0 ? (
        <EmptyCard>Nenhum abastecimento registrado ainda.</EmptyCard>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/[.08] bg-surface dark:border-white/[.145]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                <th className="px-3 py-2 font-medium">Fazenda</th>
                <th className="px-3 py-2 font-medium">Último abastecimento</th>
                <th className="px-3 py-2 text-right font-medium">Dias</th>
                <th className="px-3 py-2 text-right font-medium">Nível (cm)</th>
                <th className="px-3 py-2 text-right font-medium">Abastecimentos (12 meses)</th>
                <th className="px-3 py-2 text-right font-medium">Gasto (12 meses)</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l, i) => {
                const s = l.situacao;
                const atrasado = s !== null && s.dias_desde > DIAS_ALERTA_BOTIJAO;
                return (
                  <tr key={l.id} className={i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""}>
                    <td className="whitespace-nowrap px-3 py-2 text-black dark:text-zinc-50">{l.nome}</td>
                    {s ? (
                      <>
                        <td className="whitespace-nowrap px-3 py-2">{formatarDataBR(s.ultimo_abastecimento)}</td>
                        <td className="px-3 py-2 text-right">
                          {atrasado ? (
                            <span className="rounded-full bg-alerta-tint px-2 py-0.5 font-semibold text-alerta-ink">
                              {s.dias_desde} · atrasado
                            </span>
                          ) : (
                            s.dias_desde
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{Number(s.ultimo_nivel_cm).toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2 text-right">{s.abastecimentos_12m}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">{moeda(Number(s.gasto_12m))}</td>
                      </>
                    ) : (
                      <td colSpan={5} className="px-3 py-2 text-zinc-500 dark:text-zinc-400">
                        Nenhum abastecimento registrado
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
