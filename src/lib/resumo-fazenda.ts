import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getVacasCache,
  getPartosCache,
  getCoberturasCache,
  getControleLeiteCache,
  getBezerrosCache,
  getFinanceiroCache,
  getLeiteDiarioTodasCache,
} from "@/lib/cached-data";
import { normalizarLeite } from "@/lib/gestor";
import { hojeBrasil, somarDias } from "@/lib/datas";
import {
  indicadoresLactacao,
  coberturasDaLactacao,
  situacaoReprodutiva,
  diasEmAberto,
  diasEntre,
  GESTACAO_DIAS,
  SECAGEM_ANTES_DO_PARTO,
} from "@/lib/indicadores";

// Resumo de uma fazenda: usado pelo painel do gestor (/gestor/fazendas/[id]) e pelo relatório de
// visita do técnico (/relatorio). Usa a service role — QUEM CHAMA já validou o acesso (gestor pelo
// layout de /gestor; produtor/técnico porque o id vem de getPropriedadeAtual()).

type Vaca = { id: string; numero_identificacao: number; status_produtivo: string; status_reprodutivo: string };
type Parto = { id: string; vaca_id: string; data_parto: string; iep: number | null; ativa: boolean; cobertura_id: string | null };
type Cobertura = { id: string; vaca_id: string; data_cobertura: string; diagnostico_prenhez: string };
type Leite = { vaca_id: string; data_controle: string; litros: number };
type Bezerro = { sexo: string | null; vaca_id_gerada: string | null };
type Lancamento = { tipo: string; valor: number; data: string };

export type LactacaoResumo = {
  vacaId: string;
  numero: number;
  seca: boolean;
  dataParto: string;
  del: number;
  media: number | null;
  projecao305: number | null;
  persistencia: number | null;
  diasEmAberto: number;
  abertoFechado: boolean;
  iep: number | null;
  situacao: "prenhe" | "em_servico" | "vazia";
};

export type RecomendacaoResumo = {
  id: string;
  texto: string;
  prazo: string | null;
  concluidaEm: string | null;
  concluidaPorNome: string | null;
  dataVisita: string;
};

export type VisitaResumo = {
  id: string;
  data: string;
  observacoes: string | null;
  autorId: string | null;
  autorNome: string | null;
  recomendacoes: RecomendacaoResumo[];
};

export type ResumoFazenda = {
  hoje: string;
  propriedade: {
    id: string;
    nome: string;
    produtor: string;
    municipio: string | null;
    estado: string | null;
    tecnico: string | null;
    telefone: string | null;
  };
  rebanho: {
    vacas: number;
    lactacao: number;
    secas: number;
    novilhas: number;
    prenhes: number;
    emServico: number;
    vazias: number;
    bezerros: number;
  };
  lactacoes: LactacaoResumo[];
  medias: {
    litrosVacaDia: number | null;
    producaoDia: number | null;
    projecao305: number | null;
    iep: number | null;
    diasEmAberto: number | null;
  };
  secar: { vacaId: string; numero: number; secarEm: string; partoPrevisto: string; atrasada: boolean }[];
  partosPrevistos: { vacaId: string; numero: number; partoPrevisto: string }[];
  diagnosticos: { vacaId: string; numero: number; dataCobertura: string; dias: number }[];
  producao60dias: { data_controle: string; litros: number }[];
  financeiroMeses: { mes: string; receita: number; despesa: number }[];
  visitas: VisitaResumo[];
  recomendacoesAbertas: RecomendacaoResumo[];
};

type LinhaVisita = { id: string; data_visita: string; observacoes: string | null; autor_id: string | null; autor_nome: string | null };
type LinhaRecomendacao = {
  id: string;
  visita_id: string;
  texto: string;
  prazo: string | null;
  concluida_em: string | null;
  concluida_por_nome: string | null;
  created_at: string;
};

// Visitas (0032): as 10 mais recentes, com as recomendações; e todas as recomendações ainda em
// aberto (podem ser de visitas mais antigas). Sem as tabelas (migration não rodada), volta vazio.
async function carregarVisitas(supabase: ReturnType<typeof createServiceClient>, propriedadeId: string) {
  const [{ data: visitas, error: e1 }, { data: recs, error: e2 }] = await Promise.all([
    supabase
      .from("visitas")
      .select("id, data_visita, observacoes, autor_id, autor_nome")
      .eq("propriedade_id", propriedadeId)
      .order("data_visita", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("recomendacoes")
      .select("id, visita_id, texto, prazo, concluida_em, concluida_por_nome, created_at")
      .eq("propriedade_id", propriedadeId)
      .order("created_at"),
  ]);
  if (e1 || e2) return { visitas: [] as VisitaResumo[], abertas: [] as RecomendacaoResumo[] };

  const dataDaVisita = new Map<string, string>();
  const todas = (visitas ?? []) as LinhaVisita[];
  const idsVisitas = [...new Set(((recs ?? []) as LinhaRecomendacao[]).map((r) => r.visita_id))];
  if (idsVisitas.length > 0) {
    const { data: datasAntigas } = await supabase.from("visitas").select("id, data_visita").in("id", idsVisitas);
    for (const v of (datasAntigas ?? []) as { id: string; data_visita: string }[]) dataDaVisita.set(v.id, v.data_visita);
  }

  const paraResumo = (r: LinhaRecomendacao): RecomendacaoResumo => ({
    id: r.id,
    texto: r.texto,
    prazo: r.prazo,
    concluidaEm: r.concluida_em,
    concluidaPorNome: r.concluida_por_nome,
    dataVisita: dataDaVisita.get(r.visita_id) ?? "",
  });
  const linhas = (recs ?? []) as LinhaRecomendacao[];

  return {
    visitas: todas.map((v) => ({
      id: v.id,
      data: v.data_visita,
      observacoes: v.observacoes,
      autorId: v.autor_id,
      autorNome: v.autor_nome,
      recomendacoes: linhas.filter((r) => r.visita_id === v.id).map(paraResumo),
    })),
    abertas: linhas.filter((r) => !r.concluida_em).map(paraResumo).sort((a, b) => a.dataVisita.localeCompare(b.dataVisita)),
  };
}

const media = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

export async function carregarResumoFazenda(propriedadeId: string): Promise<ResumoFazenda | null> {
  const supabase = createServiceClient();
  const [{ data: prop }, { data: whats }, vacasD, partosD, cobD, leiteD, bezD, finD, diarioD, visitasD] = await Promise.all([
    supabase
      .from("propriedades")
      .select("id, nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel")
      .eq("id", propriedadeId)
      .maybeSingle(),
    supabase
      .from("usuarios_whatsapp")
      .select("telefone")
      .eq("propriedade_id", propriedadeId)
      .eq("ativo", true)
      .order("created_at")
      .limit(1),
    getVacasCache(propriedadeId),
    getPartosCache(propriedadeId),
    getCoberturasCache(propriedadeId),
    getControleLeiteCache(propriedadeId),
    getBezerrosCache(propriedadeId),
    getFinanceiroCache(propriedadeId),
    getLeiteDiarioTodasCache(),
    carregarVisitas(supabase, propriedadeId),
  ]);
  if (!prop) return null;

  const hoje = hojeBrasil();
  const vacas = vacasD as unknown as Vaca[];
  const partos = partosD as unknown as Parto[];
  const coberturas = cobD as unknown as Cobertura[];
  const leite = leiteD as unknown as Leite[];
  const bezerros = bezD as unknown as Bezerro[];
  const lancamentos = finD as unknown as Lancamento[];

  const numeroPorId = new Map(vacas.map((v) => [v.id, v.numero_identificacao]));
  const vacaPorId = new Map(vacas.map((v) => [v.id, v]));

  // lactações em andamento, com os mesmos cálculos da ficha da vaca
  const lactacoes: LactacaoResumo[] = partos
    .filter((p) => p.ativa && vacaPorId.has(p.vaca_id))
    .map((p) => {
      const ind = indicadoresLactacao(
        p.data_parto,
        leite.filter((l) => l.vaca_id === p.vaca_id).map((l) => ({ data: l.data_controle, litros: Number(l.litros) })),
        hoje,
      );
      const cobs = coberturasDaLactacao(coberturas.filter((c) => c.vaca_id === p.vaca_id), p.data_parto);
      const aberto = diasEmAberto(cobs, p.data_parto, hoje);
      return {
        vacaId: p.vaca_id,
        numero: numeroPorId.get(p.vaca_id)!,
        seca: vacaPorId.get(p.vaca_id)!.status_produtivo === "seca",
        dataParto: p.data_parto,
        del: ind.del,
        media: ind.mediaDiaria,
        projecao305: ind.projecao305,
        persistencia: ind.persistencia,
        diasEmAberto: aberto.dias,
        abertoFechado: aberto.fechado,
        iep: p.iep,
        situacao: situacaoReprodutiva(cobs, p.data_parto, hoje).tipo,
      };
    })
    .sort((a, b) => a.numero - b.numero);

  // prenhezes confirmadas que ainda não viraram parto
  const coberturasComParto = new Set(partos.map((p) => p.cobertura_id).filter(Boolean));
  const prenhes = coberturas
    .filter((c) => c.diagnostico_prenhez === "positivo" && !coberturasComParto.has(c.id) && numeroPorId.has(c.vaca_id))
    .map((c) => {
      const partoPrevisto = somarDias(c.data_cobertura, GESTACAO_DIAS);
      return { vacaId: c.vaca_id, numero: numeroPorId.get(c.vaca_id)!, partoPrevisto, secarEm: somarDias(partoPrevisto, -SECAGEM_ANTES_DO_PARTO) };
    })
    .sort((a, b) => a.partoPrevisto.localeCompare(b.partoPrevisto));

  const secar = prenhes
    .filter((p) => vacaPorId.get(p.vacaId)?.status_produtivo === "lactacao" && p.secarEm <= somarDias(hoje, 30))
    .map((p) => ({ ...p, atrasada: p.secarEm < hoje }));

  const diagnosticos = coberturas
    .filter((c) => c.diagnostico_prenhez === "pendente" && numeroPorId.has(c.vaca_id))
    .map((c) => ({ vacaId: c.vaca_id, numero: numeroPorId.get(c.vaca_id)!, dataCobertura: c.data_cobertura, dias: diasEntre(c.data_cobertura, hoje) }))
    .sort((a, b) => a.dataCobertura.localeCompare(b.dataCobertura));

  // produção da fazenda (inclui lactações já arquivadas)
  const inicio60 = somarDias(hoje, -59);
  const diario = normalizarLeite(diarioD as Record<string, unknown>[]).filter(
    (d) => d.propriedade_id === propriedadeId && d.data >= inicio60 && d.data <= hoje,
  );
  const ultimos30 = diario.filter((d) => d.data > somarDias(hoje, -30)).map((d) => d.litros);
  const producaoDia = media(ultimos30);
  const emLactacao = vacas.filter((v) => v.status_produtivo === "lactacao").length;

  // financeiro: últimos 6 meses (inclui o atual)
  const meses: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(`${hoje.slice(0, 7)}-15T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - i);
    meses.push(d.toISOString().slice(0, 7));
  }
  const financeiroMeses = meses.map((mes) => {
    const doMes = lancamentos.filter((l) => l.data.startsWith(mes));
    return {
      mes,
      receita: doMes.filter((l) => l.tipo === "receita").reduce((s, l) => s + Number(l.valor), 0),
      despesa: doMes.filter((l) => l.tipo === "despesa").reduce((s, l) => s + Number(l.valor), 0),
    };
  });

  const ativas = lactacoes.filter((l) => !l.seca);
  return {
    hoje,
    propriedade: {
      id: prop.id,
      nome: prop.nome_propriedade,
      produtor: prop.nome_produtor,
      municipio: prop.municipio,
      estado: prop.estado,
      tecnico: prop.tecnico_responsavel,
      telefone: whats?.[0]?.telefone ?? null,
    },
    rebanho: {
      vacas: vacas.length,
      lactacao: emLactacao,
      secas: vacas.filter((v) => v.status_produtivo === "seca").length,
      novilhas: vacas.filter((v) => v.status_produtivo === "novilha").length,
      prenhes: vacas.filter((v) => v.status_reprodutivo === "prenhe").length,
      emServico: vacas.filter((v) => v.status_reprodutivo === "vazia_em_servico").length,
      vazias: vacas.filter((v) => v.status_reprodutivo === "vazia").length,
      bezerros: bezerros.filter((b) => b.sexo !== "natimorto" && b.vaca_id_gerada === null).length,
    },
    lactacoes,
    medias: {
      litrosVacaDia: producaoDia !== null && emLactacao > 0 ? producaoDia / emLactacao : null,
      producaoDia,
      projecao305: media(ativas.map((l) => l.projecao305).filter((v): v is number => v !== null)),
      iep: media(lactacoes.map((l) => l.iep).filter((v): v is number => v !== null)),
      diasEmAberto: media(lactacoes.filter((l) => l.situacao !== "prenhe" || l.abertoFechado).map((l) => l.diasEmAberto)),
    },
    secar,
    partosPrevistos: prenhes.map(({ vacaId, numero, partoPrevisto }) => ({ vacaId, numero, partoPrevisto })),
    diagnosticos,
    producao60dias: diario.map((d) => ({ data_controle: d.data, litros: d.litros })),
    financeiroMeses,
    visitas: visitasD.visitas,
    recomendacoesAbertas: visitasD.abertas,
  };
}
