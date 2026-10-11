import Link from "next/link";
import { notFound } from "next/navigation";
import { getPropriedadeAtual } from "@/lib/propriedade";
import {
  getVacasCache,
  getPartosCache,
  getCoberturasCache,
  getControleLeiteCache,
  getBezerrosCache,
} from "@/lib/cached-data";
import { createClient } from "@/lib/supabase/server";
import { hojeBrasil } from "@/lib/datas";
import {
  indicadoresLactacao,
  coberturasDaLactacao,
  situacaoReprodutiva,
  diasEmAberto,
  diasEntre,
  totaisPorDia,
} from "@/lib/indicadores";
import { SemPropriedade } from "../../sem-propriedade";
import { ProducaoLeiteChart } from "../../producao-leite-chart";
import { formatarDataBR } from "../../format";

type Vaca = {
  id: string;
  numero_identificacao: number;
  status_produtivo: string;
  status_reprodutivo: string;
  mae: { id: string; numero_identificacao: number } | null;
};
type Parto = { id: string; vaca_id: string; data_parto: string; iep: number | null; ativa: boolean };
type Cobertura = {
  id: string;
  vaca_id: string;
  data_cobertura: string;
  diagnostico_prenhez: string;
  touro_semen: string | null;
  dose_programa: boolean | null;
};
type Leite = { vaca_id: string; data_controle: string; litros: number; periodo: string | null };
type Bezerro = {
  id: string;
  mae_id: string | null;
  numero_identificacao: number | null;
  sexo: string | null;
  data_nascimento: string | null;
  vaca_id_gerada: string | null;
};

const PRODUTIVO: Record<string, string> = { novilha: "Novilha", lactacao: "Em lactação", seca: "Seca" };
const DIAGNOSTICO: Record<string, string> = { pendente: "Pendente", positivo: "Positivo", negativo: "Negativo" };
const SEXO: Record<string, string> = { femea: "Fêmea", macho: "Macho", natimorto: "Natimorto" };

const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const n0 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border bg-surface border-black/[.08] p-3 sm:p-4 dark:border-white/[.145]">
      <span className="text-sm text-zinc-600 dark:text-zinc-400">{rotulo}</span>
      <span className="font-mono text-xl font-bold tabular-nums text-black sm:text-2xl dark:text-zinc-50">{valor}</span>
      {detalhe && <span className="text-xs text-zinc-600 dark:text-zinc-400">{detalhe}</span>}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-base font-semibold text-black dark:text-zinc-50">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function FichaVacaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return <SemPropriedade />;

  const [vacasData, partosData, coberturasData, leiteData, bezerrosData] = await Promise.all([
    getVacasCache(propriedadeAtual.id),
    getPartosCache(propriedadeAtual.id),
    getCoberturasCache(propriedadeAtual.id),
    getControleLeiteCache(propriedadeAtual.id),
    getBezerrosCache(propriedadeAtual.id),
  ]);

  // as listas já vêm filtradas pela fazenda atual: vaca de outra fazenda (ou inexistente) → 404
  const vaca = (vacasData as unknown as Vaca[]).find((v) => v.id === id);
  if (!vaca) notFound();

  const hoje = hojeBrasil();
  const partos = (partosData as unknown as Parto[]).filter((p) => p.vaca_id === id);
  const partoAtivo = partos.find((p) => p.ativa) ?? null;
  const coberturas = (coberturasData as unknown as Cobertura[]).filter((c) => c.vaca_id === id);
  const leite = (leiteData as unknown as Leite[]).filter((l) => l.vaca_id === id);
  const bezerros = bezerrosData as unknown as Bezerro[];
  const filhos = bezerros.filter((b) => b.mae_id === id).sort((a, b) => (b.data_nascimento ?? "").localeCompare(a.data_nascimento ?? ""));
  const origem = bezerros.find((b) => b.vaca_id_gerada === id);

  // lactações anteriores: arquivadas pelo registrar_parto (0015) — lidas com o cliente do usuário (RLS)
  const supabase = await createClient();
  const [{ data: partosHist }, { data: leiteHist }] = await Promise.all([
    supabase.from("partos_historico").select("id, data_parto, iep").eq("vaca_id", id).order("data_parto", { ascending: false }),
    supabase.from("controle_leite_historico").select("parto_id, data_controle, litros").eq("vaca_id", id),
  ]);
  const anteriores = (partosHist ?? []).map((p) => {
    const dias = totaisPorDia(
      (leiteHist ?? []).filter((l) => l.parto_id === p.id).map((l) => ({ data: l.data_controle, litros: Number(l.litros) })),
    );
    const total = dias.reduce((s, d) => s + d.litros, 0);
    return { ...p, diasPesados: dias.length, total, media: dias.length ? total / dias.length : null };
  });

  const ind = partoAtivo
    ? indicadoresLactacao(partoAtivo.data_parto, leite.map((l) => ({ data: l.data_controle, litros: Number(l.litros) })), hoje)
    : null;
  const cobLactacao = coberturasDaLactacao(coberturas, partoAtivo?.data_parto ?? null);
  const situacao = situacaoReprodutiva(cobLactacao, partoAtivo?.data_parto ?? null, hoje);
  const aberto = partoAtivo ? diasEmAberto(cobLactacao, partoAtivo.data_parto, hoje) : null;
  const idade = origem?.data_nascimento ? diasEntre(origem.data_nascimento, hoje) : null;

  const textoSituacao =
    situacao.tipo === "prenhe"
      ? `Prenhe (cobertura de ${formatarDataBR(situacao.cobertura)}). Parto previsto para ${formatarDataBR(situacao.partoPrevisto)}; secar a partir de ${formatarDataBR(situacao.secarEm)}.`
      : situacao.tipo === "em_servico"
        ? `Em serviço: coberta em ${formatarDataBR(situacao.cobertura)}, há ${situacao.diasDesdeCobertura} dias, aguardando diagnóstico.`
        : situacao.desde
          ? `Vazia — ${diasEntre(situacao.desde, hoje)} dias desde o parto, sem prenhez confirmada.`
          : "Vazia, sem cobertura registrada.";

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-2">
        <Link href="/vacas" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← Vacas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-black dark:text-zinc-50">Vaca {vaca.numero_identificacao}</h1>
          <Link
            href={`/vacas?editar=${vaca.id}`}
            className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            Editar cadastro
          </Link>
        </div>
        <p className="text-zinc-600 dark:text-zinc-400">
          {PRODUTIVO[vaca.status_produtivo] ?? vaca.status_produtivo}
          {vaca.mae && (
            <>
              {" · filha da "}
              <Link href={`/vacas/${vaca.mae.id}`} className="text-vacas-ink hover:underline">
                vaca {vaca.mae.numero_identificacao}
              </Link>
            </>
          )}
          {idade !== null && ` · ${idade >= 365 ? `${n1(idade / 365)} anos` : `${Math.floor(idade / 30)} meses`}`}
        </p>
      </div>

      <Secao titulo="Reprodução">
        <p className="rounded-2xl border bg-surface border-black/[.08] p-4 text-black dark:border-white/[.145] dark:text-zinc-50">
          {textoSituacao}
        </p>
      </Secao>

      {partoAtivo && ind ? (
        <Secao titulo={`Lactação atual (parto em ${formatarDataBR(partoAtivo.data_parto)})`}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Indicador
              rotulo={vaca.status_produtivo === "seca" ? "Dias desde o parto" : "Dias em lactação"}
              valor={n0(ind.del)}
              detalhe={vaca.status_produtivo === "seca" ? "vaca seca" : undefined}
            />
            <Indicador
              rotulo="Média por dia"
              valor={ind.mediaDiaria === null ? "—" : `${n1(ind.mediaDiaria)} L`}
              detalhe={`${ind.diasPesados} ${ind.diasPesados === 1 ? "dia pesado" : "dias pesados"}`}
            />
            <Indicador
              rotulo="Projeção 305 dias"
              valor={ind.projecao305 === null ? "—" : `${n0(ind.projecao305)} L`}
              detalhe={ind.del < 30 && ind.projecao305 !== null ? "estimativa inicial" : undefined}
            />
            <Indicador
              rotulo="Persistência"
              valor={ind.persistencia === null ? "—" : `${n0(ind.persistencia)}%`}
              detalhe={ind.persistencia === null ? (ind.del < 60 ? "a partir de 60 dias" : "faltam pesagens") : "últimos 30 dias vs. 30 anteriores"}
            />
            <Indicador
              rotulo="Dias em aberto"
              valor={aberto ? n0(aberto.dias) : "—"}
              detalhe={aberto && !aberto.fechado ? "ainda contando" : undefined}
            />
            <Indicador rotulo="IEP" valor={partoAtivo.iep ? `${partoAtivo.iep} dias` : "—"} detalhe={partoAtivo.iep ? undefined : "primeiro parto"} />
            <Indicador
              rotulo="Última pesagem"
              valor={ind.ultima ? `${n1(ind.ultima.litros)} L` : "—"}
              detalhe={ind.ultima ? formatarDataBR(ind.ultima.data) : undefined}
            />
            <Indicador
              rotulo="Pico"
              valor={ind.pico ? `${n1(ind.pico.litros)} L` : "—"}
              detalhe={ind.pico ? formatarDataBR(ind.pico.data) : undefined}
            />
          </div>
          {leite.length > 1 && <ProducaoLeiteChart registros={leite.map((l) => ({ data_controle: l.data_controle, litros: Number(l.litros) }))} />}
        </Secao>
      ) : (
        <Secao titulo="Lactação">
          <p className="text-zinc-600 dark:text-zinc-400">
            Sem lactação em andamento. O parto é registrado na aba{" "}
            <Link href="/reproducao" className="text-reproducao-ink hover:underline">
              Reprodução
            </Link>
            .
          </p>
        </Secao>
      )}

      <Secao titulo="Coberturas desta lactação">
        {cobLactacao.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nenhuma cobertura registrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border bg-surface border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
            {(cobLactacao as Cobertura[]).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-black dark:text-zinc-50">
                  {formatarDataBR(c.data_cobertura)}
                  {c.touro_semen && <span className="text-zinc-600 dark:text-zinc-400"> · {c.touro_semen}</span>}
                  {c.dose_programa && <span className="text-zinc-600 dark:text-zinc-400"> · dose do programa</span>}
                </span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {DIAGNOSTICO[c.diagnostico_prenhez] ?? c.diagnostico_prenhez}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {cobLactacao.length > 0 && `${cobLactacao.length} ${cobLactacao.length === 1 ? "serviço" : "serviços"} nesta lactação. `}
          Registrar cobertura ou diagnóstico:{" "}
          <Link href="/reproducao" className="text-reproducao-ink hover:underline">
            Reprodução
          </Link>
          .
        </p>
      </Secao>

      {anteriores.length > 0 && (
        <Secao titulo="Lactações anteriores">
          <div className="overflow-x-auto rounded-2xl border bg-surface border-black/[.08] dark:border-white/[.145]">
            <table className="w-full min-w-[420px] text-left text-base">
              <thead>
                <tr className="border-b border-black/[.08] text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
                  <th className="px-4 py-2 font-medium">Parto</th>
                  <th className="px-4 py-2 font-medium">IEP</th>
                  <th className="px-4 py-2 font-medium">Média/dia</th>
                  <th className="px-4 py-2 font-medium">Dias pesados</th>
                </tr>
              </thead>
              <tbody>
                {anteriores.map((p) => (
                  <tr key={p.id} className="border-t border-black/[.04] dark:border-white/[.06]">
                    <td className="px-4 py-2 text-black dark:text-zinc-50">{formatarDataBR(p.data_parto)}</td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{p.iep ? `${p.iep} dias` : "—"}</td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{p.media === null ? "—" : `${n1(p.media)} L`}</td>
                    <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{p.diasPesados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Secao>
      )}

      <Secao titulo="Crias">
        {filhos.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Nenhuma cria registrada.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-black/[.06] rounded-2xl border bg-surface border-black/[.08] dark:divide-white/[.08] dark:border-white/[.145]">
            {filhos.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="text-black dark:text-zinc-50">
                  {b.numero_identificacao ? `Nº ${b.numero_identificacao}` : "Sem número"}
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {" · "}
                    {SEXO[b.sexo ?? ""] ?? "sexo não informado"}
                    {b.data_nascimento && ` · ${formatarDataBR(b.data_nascimento)}`}
                  </span>
                </span>
                {b.vaca_id_gerada && (
                  <Link href={`/vacas/${b.vaca_id_gerada}`} className="text-sm text-vacas-ink hover:underline">
                    ver ficha
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}
