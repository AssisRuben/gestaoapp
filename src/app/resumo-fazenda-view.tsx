import Link from "next/link";
import type { ResumoFazenda } from "@/lib/resumo-fazenda";
import { ProducaoLeiteChart } from "./(app)/producao-leite-chart";
import { formatarDataBR, formatarTelefoneBR } from "./(app)/format";

// Visão do resumo da fazenda (gestor e relatório de visita). Server component; linkVaca devolve a
// rota da ficha da vaca quando quem está vendo pode abrir (produtor/técnico), ou null (gestor).

const n0 = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }));
const n1 = (v: number | null) => (v === null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const NOMES_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const SITUACAO: Record<string, string> = { prenhe: "Prenhe", em_servico: "Em serviço", vazia: "Vazia" };

const CARTAO = "rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145] print:break-inside-avoid print:border-black/20";

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className={`flex flex-col gap-0.5 p-3 sm:p-4 ${CARTAO}`}>
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{rotulo}</span>
      <span className="font-mono text-xl font-bold tabular-nums text-black sm:text-2xl dark:text-zinc-50">{valor}</span>
      {detalhe && <span className="text-xs text-zinc-600 dark:text-zinc-400">{detalhe}</span>}
    </div>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-black dark:text-zinc-50">{children}</h2>;
}

function NomeVaca({ id, numero, linkVaca }: { id: string; numero: number; linkVaca: (id: string) => string | null }) {
  const href = linkVaca(id);
  return href ? (
    <Link href={href} className="hover:underline print:no-underline">
      Vaca {numero}
    </Link>
  ) : (
    <>Vaca {numero}</>
  );
}

export function ResumoFazendaView({
  resumo,
  linkVaca = () => null,
}: {
  resumo: ResumoFazenda;
  linkVaca?: (id: string) => string | null;
}) {
  const { propriedade: p, rebanho: r, medias: m } = resumo;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-black dark:text-zinc-50">{p.nome}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Produtor: {p.produtor}
          {p.municipio && ` · ${p.municipio}${p.estado ? `/${p.estado}` : ""}`}
          {p.tecnico && ` · Técnico: ${p.tecnico}`}
          {p.telefone && ` · WhatsApp ${formatarTelefoneBR(p.telefone)}`}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Situação em {formatarDataBR(resumo.hoje)}</p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 print:grid-cols-3">
        <Numero rotulo="Vacas em lactação" valor={`${r.lactacao} de ${r.vacas}`} detalhe={`${r.secas} secas · ${r.novilhas} novilhas`} />
        <Numero rotulo="Produção por dia" valor={m.producaoDia === null ? "—" : `${n0(m.producaoDia)} L`} detalhe="média dos últimos 30 dias" />
        <Numero rotulo="Litros por vaca/dia" valor={n1(m.litrosVacaDia)} detalhe="produção ÷ vacas em lactação" />
        <Numero rotulo="Projeção 305 dias" valor={m.projecao305 === null ? "—" : `${n0(m.projecao305)} L`} detalhe="média das lactações em andamento" />
        <Numero rotulo="IEP médio" valor={m.iep === null ? "—" : `${n0(m.iep)} dias`} />
        <Numero rotulo="Dias em aberto (média)" valor={n0(m.diasEmAberto)} detalhe={`${r.prenhes} prenhes · ${r.emServico} em serviço · ${r.vazias} vazias`} />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3 print:grid-cols-3">
        <div className={`p-4 ${CARTAO}`}>
          <Titulo>Para secar (próximos 30 dias)</Titulo>
          {resumo.secar.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Nenhuma.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {resumo.secar.map((s) => (
                <li key={s.vacaId} className={s.atrasada ? "font-semibold text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"}>
                  <NomeVaca id={s.vacaId} numero={s.numero} linkVaca={linkVaca} /> — {s.atrasada ? "atrasada, era " : ""}
                  {formatarDataBR(s.secarEm)}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`p-4 ${CARTAO}`}>
          <Titulo>Aguardando diagnóstico</Titulo>
          {resumo.diagnosticos.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Nenhuma.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {resumo.diagnosticos.map((d) => (
                <li key={`${d.vacaId}-${d.dataCobertura}`} className={d.dias > 45 ? "font-semibold text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"}>
                  <NomeVaca id={d.vacaId} numero={d.numero} linkVaca={linkVaca} /> — coberta em {formatarDataBR(d.dataCobertura)} ({d.dias} dias)
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={`p-4 ${CARTAO}`}>
          <Titulo>Partos previstos</Titulo>
          {resumo.partosPrevistos.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Nenhum.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm text-black dark:text-zinc-50">
              {resumo.partosPrevistos.map((pp) => (
                <li key={pp.vacaId}>
                  <NomeVaca id={pp.vacaId} numero={pp.numero} linkVaca={linkVaca} /> — {formatarDataBR(pp.partoPrevisto)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {(resumo.visitas.length > 0 || resumo.recomendacoesAbertas.length > 0) && (
        <section className="flex flex-col gap-4">
          <div className={`p-4 ${CARTAO}`}>
            <Titulo>Recomendações em aberto ({resumo.recomendacoesAbertas.length})</Titulo>
            {resumo.recomendacoesAbertas.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Todas cumpridas.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {resumo.recomendacoesAbertas.map((r) => {
                  const vencida = r.prazo !== null && r.prazo < resumo.hoje;
                  return (
                    <li key={r.id} className={vencida ? "text-red-600 dark:text-red-400" : "text-black dark:text-zinc-50"}>
                      ○ {r.texto}
                      <span className="text-zinc-600 dark:text-zinc-400">
                        {" "}
                        — desde {formatarDataBR(r.dataVisita)}
                        {r.prazo && `, prazo ${formatarDataBR(r.prazo)}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {resumo.visitas.length > 0 && (
            <div className={`p-4 ${CARTAO}`}>
              <Titulo>
                {resumo.visitas.length === 1 ? "Visita técnica" : `Visitas técnicas (${resumo.visitas.length} mais recentes)`}
              </Titulo>
              {/* Todas as visitas carregadas (até 10), da mais recente pra mais antiga. */}
              <ol className="mt-2 flex flex-col divide-y divide-black/[.06] dark:divide-white/[.08]">
                {resumo.visitas.map((v) => (
                  <li key={v.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 print:break-inside-avoid">
                    <p className="text-sm font-semibold text-black dark:text-zinc-50">
                      {formatarDataBR(v.data)}
                      {v.autorNome && <span className="font-normal text-zinc-600 dark:text-zinc-400"> · {v.autorNome}</span>}
                    </p>
                    {v.observacoes && (
                      <p className="whitespace-pre-line text-sm text-black dark:text-zinc-50">{v.observacoes}</p>
                    )}
                    {v.recomendacoes.length > 0 && (
                      <ul className="flex flex-col gap-0.5 text-sm">
                        {v.recomendacoes.map((r) => (
                          <li key={r.id} className={r.concluidaEm ? "text-zinc-500 line-through" : "text-black dark:text-zinc-50"}>
                            {r.concluidaEm ? "✓" : "○"} {r.texto}
                            {r.concluidaEm ? (
                              <span className="no-underline"> — feita em {formatarDataBR(r.concluidaEm.slice(0, 10))}</span>
                            ) : (
                              r.prazo && <span className="text-zinc-600 dark:text-zinc-400"> — prazo {formatarDataBR(r.prazo)}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Titulo>Lactações em andamento ({resumo.lactacoes.length})</Titulo>
        {resumo.lactacoes.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nenhuma lactação em andamento.</p>
        ) : (
          <div className={`overflow-x-auto ${CARTAO}`}>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                  <th className="px-3 py-2 font-medium">Vaca</th>
                  <th className="px-3 py-2 font-medium">Parto</th>
                  <th className="px-3 py-2 text-right font-medium">DEL</th>
                  <th className="px-3 py-2 text-right font-medium">L/dia</th>
                  <th className="px-3 py-2 text-right font-medium">Proj. 305</th>
                  <th className="px-3 py-2 text-right font-medium">Persist.</th>
                  <th className="px-3 py-2 text-right font-medium">Dias em aberto</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {resumo.lactacoes.map((l) => (
                  <tr key={l.vacaId} className="border-t border-black/[.04] dark:border-white/[.06]">
                    <td className="px-3 py-1.5 font-medium text-black dark:text-zinc-50">
                      <NomeVaca id={l.vacaId} numero={l.numero} linkVaca={linkVaca} />
                      {l.seca && <span className="ml-1 text-xs font-normal text-zinc-500">(seca)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400">{formatarDataBR(l.dataParto)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.del}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{n1(l.media)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{n0(l.projecao305)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{l.persistencia === null ? "—" : `${n0(l.persistencia)}%`}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${!l.abertoFechado && l.diasEmAberto > 120 ? "font-semibold text-red-600 dark:text-red-400" : ""}`}>
                      {l.diasEmAberto}
                      {!l.abertoFechado && "+"}
                    </td>
                    <td className="px-3 py-1.5">{SITUACAO[l.situacao]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          L/dia = média dos dias com pesagem. Dias em aberto com &quot;+&quot; ainda estão contando (sem prenhez confirmada).
        </p>
      </section>

      {resumo.producao60dias.length > 1 && (
        <section className="flex flex-col gap-2 print:break-inside-avoid">
          <Titulo>Produção da fazenda — últimos 60 dias</Titulo>
          <ProducaoLeiteChart registros={resumo.producao60dias} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Titulo>Financeiro — últimos 6 meses</Titulo>
        <div className={`overflow-x-auto ${CARTAO}`}>
          <table className="w-full min-w-[420px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/[.08] text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                <th className="px-3 py-2 font-medium">Mês</th>
                <th className="px-3 py-2 text-right font-medium">Receitas</th>
                <th className="px-3 py-2 text-right font-medium">Despesas</th>
                <th className="px-3 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {resumo.financeiroMeses.map((f) => {
                const saldo = f.receita - f.despesa;
                return (
                  <tr key={f.mes} className="border-t border-black/[.04] dark:border-white/[.06]">
                    <td className="px-3 py-1.5">{`${NOMES_MESES[Number(f.mes.slice(5, 7)) - 1]}/${f.mes.slice(2, 4)}`}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{reais(f.receita)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{reais(f.despesa)}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${saldo < 0 ? "text-red-600 dark:text-red-400" : "text-brand-green"}`}>
                      {reais(saldo)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
