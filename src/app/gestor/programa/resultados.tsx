import { EmptyCard } from "../../(app)/mobile-list";
import { formatarDataBR } from "../../(app)/format";
import type { IndicadoresReprodutivos } from "@/lib/programa";

type Propriedade = { id: string; nome_propriedade: string };

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: React.ReactNode; detalhe?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{rotulo}</span>
      <span className="text-2xl font-bold text-black dark:text-zinc-50">{valor}</span>
      {detalhe && <span className="text-xs text-zinc-600 dark:text-zinc-400">{detalhe}</span>}
    </div>
  );
}

const pct = (v: number | null) =>
  v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const num = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// Resultados das inseminações feitas com dose do programa (view
// indicadores_reprodutivos_programa, 0021). Os totais são recalculados a partir das contagens —
// não é média das taxas de cada fazenda, que daria o mesmo peso a quem usou 2 doses e a quem usou 44.
export function ResultadosReprodutivos({
  propriedades,
  indicadores,
}: {
  propriedades: Propriedade[];
  indicadores: IndicadoresReprodutivos[];
}) {
  const nomePorId = new Map(propriedades.map((p) => [p.id, p.nome_propriedade]));
  const linhas = [...indicadores].sort((a, b) =>
    (nomePorId.get(a.propriedade_id) ?? "").localeCompare(nomePorId.get(b.propriedade_id) ?? "", "pt-BR"),
  );

  const soma = (campo: keyof IndicadoresReprodutivos) =>
    linhas.reduce((total, l) => total + Number(l[campo] ?? 0), 0);
  const doses = soma("doses_usadas");
  const prenhezes = soma("prenhezes");
  const negativos = soma("negativos");
  const diagnosticadas = prenhezes + negativos;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-black dark:text-zinc-50">Resultados reprodutivos</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Só inseminações com dose do programa. Taxa de concepção = positivas ÷ diagnosticadas
          (pendentes ficam fora até o diagnóstico).
        </p>
      </div>

      {linhas.length === 0 ? (
        <EmptyCard>Nenhuma inseminação com dose do programa registrada ainda.</EmptyCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
            <Indicador rotulo="Inseminações" valor={doses} />
            <Indicador rotulo="Matrizes inseminadas" valor={soma("matrizes_inseminadas")} />
            <Indicador
              rotulo="Taxa de concepção"
              valor={pct(diagnosticadas > 0 ? (prenhezes * 100) / diagnosticadas : null)}
              detalhe={`${prenhezes} de ${diagnosticadas} diagnosticadas · ${soma("pendentes")} pendentes`}
            />
            <Indicador rotulo="Doses por prenhez" valor={num(prenhezes > 0 ? doses / prenhezes : null)} />
            <Indicador rotulo="Gestações em curso" valor={soma("gestacoes_em_curso")} />
            <Indicador
              rotulo="Nascimentos"
              valor={soma("nascimentos")}
              detalhe={`${soma("femeas")} fêmeas · ${soma("machos")} machos · ${soma("natimortos")} natimortos`}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                  <th className="px-3 py-2 font-medium">Fazenda</th>
                  <th className="px-3 py-2 text-right font-medium">Inseminações</th>
                  <th className="px-3 py-2 text-right font-medium">Matrizes</th>
                  <th className="px-3 py-2 text-right font-medium">Prenhezes</th>
                  <th className="px-3 py-2 text-right font-medium">Pendentes</th>
                  <th className="px-3 py-2 text-right font-medium">Concepção</th>
                  <th className="px-3 py-2 text-right font-medium">Doses/prenhez</th>
                  <th className="px-3 py-2 text-right font-medium">Em gestação</th>
                  <th className="px-3 py-2 font-medium">Próximo parto</th>
                  <th className="px-3 py-2 text-right font-medium">Nascidos (F/M)</th>
                  <th className="px-3 py-2 text-right font-medium">Fêmeas no rebanho</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.propriedade_id} className={i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""}>
                    <td className="whitespace-nowrap px-3 py-2 text-black dark:text-zinc-50">
                      {nomePorId.get(l.propriedade_id) ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">{l.doses_usadas}</td>
                    <td className="px-3 py-2 text-right">{l.matrizes_inseminadas}</td>
                    <td className="px-3 py-2 text-right">{l.prenhezes}</td>
                    <td className="px-3 py-2 text-right">{l.pendentes}</td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {pct(l.taxa_concepcao === null ? null : Number(l.taxa_concepcao))}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {num(l.doses_por_prenhez === null ? null : Number(l.doses_por_prenhez))}
                    </td>
                    <td className="px-3 py-2 text-right">{l.gestacoes_em_curso}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {l.proximo_parto_previsto ? formatarDataBR(l.proximo_parto_previsto) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.nascimentos} ({l.femeas}/{l.machos})
                    </td>
                    <td className="px-3 py-2 text-right">{l.femeas_no_rebanho}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
