import { NextResponse } from "next/server";
import { isGestor } from "@/lib/propriedade";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getResumoFazendasCache,
  getIndicadoresTodasCache,
  getLeiteDiarioTodasCache,
  getFinanceiroDiarioTodasCache,
  getSaldoDosesTodasCache,
  getTourosCache,
} from "@/lib/cached-data";
import { normalizarResumo, normalizarLeite, normalizarFinanceiro, hojeBrasil } from "@/lib/gestor";
import { paraCsv, type Celula } from "@/lib/csv";

// Planilhas do painel do gestor (botões na Visão Geral). Route handler NÃO passa pelo layout de
// /gestor: a checagem de gestor tem que ser feita aqui. Leituras com service role, como o resto do
// painel; os números são os mesmos das telas (mesmas views/funções do banco).

type Linha = Record<string, unknown>;
const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

async function nomesFazendas() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("propriedades")
    .select("id, nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel")
    .order("nome_propriedade")
    .order("id");
  if (error) throw new Error(error.message);
  return (data ?? []) as {
    id: string;
    nome_propriedade: string;
    nome_produtor: string;
    municipio: string | null;
    estado: string | null;
    tecnico_responsavel: string | null;
  }[];
}

async function planilhaFazendas() {
  const [fazendas, resumoD, indicadoresD] = await Promise.all([nomesFazendas(), getResumoFazendasCache(), getIndicadoresTodasCache()]);
  const resumo = new Map(normalizarResumo(resumoD).map((r) => [r.propriedade_id, r]));
  const ind = new Map((indicadoresD as Linha[]).map((i) => [i.propriedade_id as string, i]));
  return paraCsv(
    ["Fazenda", "Produtor", "Município", "UF", "Técnico responsável", "WhatsApp", "Vacas", "Em lactação", "Novilhas",
      "Bezerros vivos", "Litros/vaca/dia", "Produção/dia (L)", "Receita mensal (R$)", "Despesa mensal (R$)",
      "Custo/litro (R$)", "IEP médio (dias)", "Último leite", "Último financeiro"],
    fazendas.map((f): Celula[] => {
      const r = resumo.get(f.id);
      const i = ind.get(f.id);
      return [
        f.nome_propriedade, f.nome_produtor, f.municipio, f.estado, f.tecnico_responsavel, r?.telefone,
        r?.vacas_total, r?.vacas_lactacao, n(i?.novilhas), r?.bezerros_vivos,
        n(i?.litros_vaca_dia), n(i?.producao_dia), n(i?.receita_mensal), n(i?.despesa_mensal), n(i?.custo_litro),
        r && r.iep_qtd > 0 && r.iep_soma !== null ? r.iep_soma / r.iep_qtd : null,
        r?.ultimo_leite, r?.ultimo_financeiro,
      ];
    }),
  );
}

async function planilhaLeite() {
  const [fazendas, leiteD] = await Promise.all([nomesFazendas(), getLeiteDiarioTodasCache()]);
  const nome = new Map(fazendas.map((f) => [f.id, f.nome_propriedade]));
  const linhas = normalizarLeite(leiteD as Linha[])
    .filter((l) => nome.has(l.propriedade_id))
    .sort((a, b) => nome.get(a.propriedade_id)!.localeCompare(nome.get(b.propriedade_id)!, "pt-BR") || a.data.localeCompare(b.data));
  return paraCsv(["Fazenda", "Data", "Litros", "Vacas pesadas"], linhas.map((l) => [nome.get(l.propriedade_id), l.data, l.litros, l.pesagens]));
}

async function planilhaFinanceiro() {
  const [fazendas, finD] = await Promise.all([nomesFazendas(), getFinanceiroDiarioTodasCache()]);
  const nome = new Map(fazendas.map((f) => [f.id, f.nome_propriedade]));
  const porMes = new Map<string, { fazenda: string; mes: string; receita: number; despesa: number }>();
  for (const d of normalizarFinanceiro(finD as Linha[])) {
    if (!nome.has(d.propriedade_id)) continue;
    const chave = `${d.propriedade_id}|${d.data.slice(0, 7)}`;
    const atual = porMes.get(chave) ?? { fazenda: nome.get(d.propriedade_id)!, mes: d.data.slice(0, 7), receita: 0, despesa: 0 };
    atual.receita += d.receita;
    atual.despesa += d.despesa;
    porMes.set(chave, atual);
  }
  const linhas = [...porMes.values()].sort((a, b) => a.fazenda.localeCompare(b.fazenda, "pt-BR") || a.mes.localeCompare(b.mes));
  return paraCsv(
    ["Fazenda", "Mês", "Receitas (R$)", "Despesas (R$)", "Saldo (R$)"],
    linhas.map((l) => [l.fazenda, `${l.mes.slice(5, 7)}/${l.mes.slice(0, 4)}`, l.receita, l.despesa, l.receita - l.despesa]),
  );
}

async function planilhaDoses() {
  const [fazendas, saldosD, tourosD] = await Promise.all([nomesFazendas(), getSaldoDosesTodasCache(), getTourosCache()]);
  const nome = new Map(fazendas.map((f) => [f.id, f.nome_propriedade]));
  const touro = new Map((tourosD as Linha[]).map((t) => [t.id as string, t]));
  const linhas = (saldosD as Linha[])
    .filter((s) => nome.has(s.propriedade_id as string))
    .map((s) => ({ s, fazenda: nome.get(s.propriedade_id as string)!, t: touro.get(s.touro_id as string) }))
    .sort((a, b) => a.fazenda.localeCompare(b.fazenda, "pt-BR") || String(a.t?.nome ?? "").localeCompare(String(b.t?.nome ?? ""), "pt-BR"));
  return paraCsv(
    ["Fazenda", "Touro", "Código", "Recebidas", "A receber", "Usadas", "Perdidas", "Saldo"],
    linhas.map(({ s, fazenda, t }) => [
      fazenda, t?.nome as string, t?.codigo as string, n(s.recebidas), n(s.a_receber), n(s.utilizadas), n(s.baixas), n(s.saldo),
    ]),
  );
}

const PLANILHAS: Record<string, () => Promise<string>> = {
  fazendas: planilhaFazendas,
  leite: planilhaLeite,
  financeiro: planilhaFinanceiro,
  doses: planilhaDoses,
};

export async function GET(_request: Request, { params }: { params: Promise<{ planilha: string }> }) {
  if (!(await isGestor())) {
    return NextResponse.json({ error: "Só o gestor pode exportar as planilhas." }, { status: 403 });
  }
  const { planilha } = await params;
  const gerar = PLANILHAS[planilha];
  if (!gerar) return NextResponse.json({ error: "Planilha desconhecida." }, { status: 404 });

  const csv = await gerar();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gestaopec-${planilha}-${hojeBrasil()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
