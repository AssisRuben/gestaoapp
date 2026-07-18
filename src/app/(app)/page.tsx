import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";
import { ProducaoLeiteChart } from "./producao-leite-chart";
import { TagIcon, MilkIcon, MoneyIcon } from "./nav-icons";

function hojeStr() {
  return new Date().toISOString().slice(0, 10);
}

function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export default async function DashboardPage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center sm:p-16">
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Sua conta ainda não está vinculada a nenhuma propriedade. Fale com o
          administrador do sistema.
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  const hoje = hojeStr();
  const inicioMes = `${hoje.slice(0, 7)}-01`;

  const [{ data: vacasData }, { data: leiteData }, { data: financeiroData }, { data: coberturasData }] =
    await Promise.all([
      supabase
        .from("vacas")
        .select("id, numero_identificacao, status_produtivo")
        .eq("propriedade_id", propriedadeAtual.id),
      supabase
        .from("controle_leite")
        .select("litros, data_controle, vaca:vaca_id!inner(propriedade_id)")
        .eq("vaca.propriedade_id", propriedadeAtual.id),
      supabase
        .from("financeiro")
        .select("tipo, valor, data")
        .eq("propriedade_id", propriedadeAtual.id)
        .gte("data", inicioMes)
        .lte("data", hoje),
      supabase
        .from("coberturas")
        .select("vaca_id, data_cobertura, diagnostico_prenhez, vaca:vaca_id!inner(numero_identificacao, propriedade_id)")
        .eq("vaca.propriedade_id", propriedadeAtual.id),
    ]);

  const vacas = vacasData ?? [];
  const registrosLeite = (leiteData ?? []) as unknown as { litros: number; data_controle: string }[];
  const lancamentos = financeiroData ?? [];
  const coberturas = (coberturasData ?? []) as unknown as {
    vaca_id: string;
    data_cobertura: string;
    diagnostico_prenhez: string;
    vaca: { numero_identificacao: number };
  }[];

  // KPI: vacas em lactação
  const vacasEmLactacao = vacas.filter((v) => v.status_produtivo === "lactacao").length;
  const statusPorVacaId = new Map(vacas.map((v) => [v.id, v.status_produtivo]));

  // KPI: litros no mês atual
  const litrosMes = registrosLeite
    .filter((r) => r.data_controle >= inicioMes && r.data_controle <= hoje)
    .reduce((soma, r) => soma + Number(r.litros), 0);

  // KPI: saldo do mês
  let receitasMes = 0;
  let despesasMes = 0;
  for (const l of lancamentos) {
    if (l.tipo === "receita") receitasMes += Number(l.valor);
    else despesasMes += Number(l.valor);
  }
  const saldoMes = receitasMes - despesasMes;

  // Vacas pra secar: cobertura confirmada mais recente por vaca (regra 7 do CLAUDE.md)
  const ultimaPositivaPorVaca = new Map<string, { data_cobertura: string; numero: number }>();
  for (const c of coberturas) {
    if (c.diagnostico_prenhez !== "positivo") continue;
    const atual = ultimaPositivaPorVaca.get(c.vaca_id);
    if (!atual || c.data_cobertura > atual.data_cobertura) {
      ultimaPositivaPorVaca.set(c.vaca_id, {
        data_cobertura: c.data_cobertura,
        numero: c.vaca.numero_identificacao,
      });
    }
  }
  const inicioJanelaSecagem = somarDias(hoje, -5);
  const fimJanelaSecagem = somarDias(hoje, 30);
  const vacasPraSecar = [...ultimaPositivaPorVaca.entries()]
    .filter(([vacaId]) => statusPorVacaId.get(vacaId) === "lactacao")
    .map(([, info]) => {
      const partoPrevisto = somarDias(info.data_cobertura, 283);
      const secagemPrevista = somarDias(partoPrevisto, -60);
      return { numero: info.numero, secagemPrevista };
    })
    .filter((v) => v.secagemPrevista >= inicioJanelaSecagem && v.secagemPrevista <= fimJanelaSecagem)
    .sort((a, b) => a.secagemPrevista.localeCompare(b.secagemPrevista));

  // Diagnósticos pendentes
  const diagnosticosPendentes = coberturas
    .filter((c) => c.diagnostico_prenhez === "pendente")
    .map((c) => ({ numero: c.vaca.numero_identificacao, data_cobertura: c.data_cobertura }))
    .sort((a, b) => a.data_cobertura.localeCompare(b.data_cobertura));

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          {propriedadeAtual.nome_propriedade}
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Produtor: {propriedadeAtual.nome_produtor}
          {propriedadeAtual.municipio && ` · ${propriedadeAtual.municipio}`}
          {propriedadeAtual.estado && `/${propriedadeAtual.estado}`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/vacas"
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-black/[.08] p-2 text-center transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          <TagIcon className="h-6 w-6 text-brand-green" />
          <p className="text-lg font-semibold text-black dark:text-zinc-50">{vacasEmLactacao}</p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Vacas em lactação</p>
        </Link>
        <Link
          href="/leite"
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-black/[.08] p-2 text-center transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          <MilkIcon className="h-6 w-6 text-brand-green" />
          <p className="text-lg font-semibold text-black dark:text-zinc-50">
            {litrosMes.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} L
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Litros no mês</p>
        </Link>
        <Link
          href="/financeiro"
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-black/[.08] p-2 text-center transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
        >
          <MoneyIcon className={saldoMes >= 0 ? "h-6 w-6 text-brand-green" : "h-6 w-6 text-red-600 dark:text-red-400"} />
          <p
            className={`text-lg font-semibold ${saldoMes >= 0 ? "text-brand-green" : "text-red-600 dark:text-red-400"}`}
          >
            {formatarMoeda(saldoMes)}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">Saldo do mês</p>
        </Link>
      </div>

      <ProducaoLeiteChart registros={registrosLeite} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-sm font-medium text-black dark:text-zinc-50">Vacas pra secar</p>
            <Link href="/reproducao" className="text-sm text-brand-green hover:underline">
              Ver em Reprodução
            </Link>
          </div>
          <table className="w-full text-left text-sm">
            <tbody>
              {vacasPraSecar.map((v, i) => (
                <tr
                  key={v.numero}
                  className={`border-t border-black/[.08] dark:border-white/[.145] ${
                    i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-black dark:text-zinc-50">Vaca {v.numero}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{v.secagemPrevista}</td>
                </tr>
              ))}
              {vacasPraSecar.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                    Nenhuma vaca pra secar nos próximos 30 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-black/[.08] dark:border-white/[.145]">
          <div className="flex items-center justify-between px-4 py-2">
            <p className="text-sm font-medium text-black dark:text-zinc-50">Diagnósticos pendentes</p>
            <Link href="/reproducao" className="text-sm text-brand-green hover:underline">
              Ver em Reprodução
            </Link>
          </div>
          <table className="w-full text-left text-sm">
            <tbody>
              {diagnosticosPendentes.map((d, i) => (
                <tr
                  key={`${d.numero}-${d.data_cobertura}`}
                  className={`border-t border-black/[.08] dark:border-white/[.145] ${
                    i % 2 === 1 ? "bg-black/[.02] dark:bg-white/[.03]" : ""
                  }`}
                >
                  <td className="px-4 py-2 text-black dark:text-zinc-50">Vaca {d.numero}</td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{d.data_cobertura}</td>
                </tr>
              ))}
              {diagnosticosPendentes.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-400">
                    Nenhum diagnóstico pendente.
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
