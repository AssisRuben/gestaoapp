import { exigirGestor } from "@/lib/propriedade";
import {
  getPropriedadesTodasCache,
  getTourosCache,
  getEntregasDosesTodasCache,
  getSaldoDosesTodasCache,
  getAdesoesTodasCache,
  getIndicadoresAtuaisCache,
  getBaixasDosesTodasCache,
  getIndicadoresReprodutivosTodasCache,
  getInseminacoesMesTodasCache,
  getBotijaoSituacaoTodasCache,
  getVacasPrenhesTodasCache,
} from "@/lib/cached-data";
import type { InseminacoesMes, BotijaoSituacao } from "@/lib/programa";
import { hojeBrasil } from "@/lib/datas";
import { EvolucaoSecao, BotijaoSecao } from "./acompanhamento";
import type { MesInseminacoes } from "./evolucao-mensal";
import type {
  Touro,
  EntregaDoses,
  SaldoDoses,
  Adesao,
  IndicadoresAtuais,
  BaixaDoses,
  IndicadoresReprodutivos,
} from "@/lib/programa";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { EntregaDosesTecnico, SaldoDosesTecnico, TecnicoPrograma } from "@/lib/programa";
import { ProgramaClient, type EntidadeOpcao } from "./programa-client";

// Dados reais (diferente das outras abas do gestor, ainda fictícias). O layout do gestor já
// validou isGestor() antes de chegar aqui, que é o que autoriza as leituras com service role.
export default async function ProgramaPage() {
  await exigirGestor();
  const [
    propriedadesData,
    tourosData,
    entregasData,
    saldosData,
    adesoesData,
    atuaisData,
    baixasData,
    reprodutivosData,
    { data: entidadesData },
    entregasTecnicoRes,
    saldosTecnicoRes,
    tecnicosRes,
    inseminacoesMesData,
    botijaoData,
    prenhesPorFazenda,
    saldosEntidadeRes,
  ] = await Promise.all([
    getPropriedadesTodasCache(),
    getTourosCache(),
    getEntregasDosesTodasCache(),
    getSaldoDosesTodasCache(),
    getAdesoesTodasCache(),
    getIndicadoresAtuaisCache(),
    getBaixasDosesTodasCache(),
    getIndicadoresReprodutivosTodasCache(),
    // entidades cadastradas (aba Entidades) pra escolher na entrega — sem cache, a lista é curta
    createServiceClient().from("entidades").select("id, nome, responsavel, telefone").order("nome"),
    // doses com os técnicos (0055) — sem a migration, as seções ficam vazias
    createServiceClient()
      .from("entregas_doses_tecnico")
      .select("*, touro:touro_id(id, nome, codigo), entidade:entidade_id(nome, responsavel, telefone)")
      .order("data_entrega", { ascending: false })
      .order("id"),
    createServiceClient().from("saldo_doses_tecnico").select("*").order("tecnico_id").order("touro_id"),
    (await createClient()).rpc("listar_tecnicos_programa"),
    getInseminacoesMesTodasCache(),
    getBotijaoSituacaoTodasCache(),
    getVacasPrenhesTodasCache(),
    // doses que cada entidade ainda tem (0068) — sem a migration, o formulário só não mostra o saldo
    createServiceClient().from("saldo_doses_entidade").select("entidade_id, touro_id, saldo"),
  ]);

  const saldosEntidade = (saldosEntidadeRes.data ?? []) as { entidade_id: string; touro_id: string; saldo: number }[];
  const entidadesComSaldo = ((entidadesData ?? []) as EntidadeOpcao[]).map((e) => ({
    ...e,
    saldos: saldosEntidade
      .filter((s) => s.entidade_id === e.id)
      .map((s) => ({ touro_id: s.touro_id, saldo: Number(s.saldo) })),
  }));

  // acompanhamento (0064). Fazenda do programa = recebeu alguma entrega de doses.
  const propriedades = propriedadesData as { id: string; nome_propriedade: string }[];
  const doPrograma = new Set((entregasData as unknown as EntregaDoses[]).map((e) => e.propriedade_id));

  // últimos 12 meses, terminando no mês atual (mês sem inseminação aparece zerado)
  const [anoHoje, mesHoje] = hojeBrasil().split("-").map(Number);
  const meses: MesInseminacoes[] = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(anoHoje, mesHoje - 12 + i, 1));
    return { mes: d.toISOString().slice(0, 10), prenhezes: 0, negativos: 0, pendentes: 0 };
  });
  const porMes = new Map(meses.map((m) => [m.mes, m]));
  for (const l of inseminacoesMesData as unknown as InseminacoesMes[]) {
    const m = porMes.get(String(l.mes).slice(0, 10));
    if (!m) continue;
    m.prenhezes += Number(l.prenhezes);
    m.negativos += Number(l.negativos);
    m.pendentes += Number(l.pendentes);
  }
  const vacasPrenhes = [...doPrograma].reduce((t, id) => t + (prenhesPorFazenda[id] ?? 0), 0);

  const situacaoPorFazenda = new Map(
    (botijaoData as unknown as BotijaoSituacao[]).map((b) => [b.propriedade_id, b]),
  );
  const linhasBotijao = propriedades
    .filter((p) => doPrograma.has(p.id) || situacaoPorFazenda.has(p.id))
    .map((p) => ({ id: p.id, nome: p.nome_propriedade, situacao: situacaoPorFazenda.get(p.id) ?? null }));

  return (
    <ProgramaClient
      propriedades={propriedades}
      evolucao={<EvolucaoSecao meses={meses} vacasPrenhes={vacasPrenhes} />}
      botijao={<BotijaoSecao linhas={linhasBotijao} />}
      touros={tourosData as unknown as Touro[]}
      entregas={entregasData as unknown as EntregaDoses[]}
      saldos={saldosData as unknown as SaldoDoses[]}
      adesoes={adesoesData as unknown as Adesao[]}
      atuais={atuaisData as unknown as IndicadoresAtuais[]}
      baixas={baixasData as unknown as BaixaDoses[]}
      reprodutivos={reprodutivosData as unknown as IndicadoresReprodutivos[]}
      entidades={entidadesComSaldo}
      entregasTecnico={(entregasTecnicoRes.data ?? []) as unknown as EntregaDosesTecnico[]}
      saldosTecnico={((saldosTecnicoRes.data ?? []) as unknown as SaldoDosesTecnico[]).map((s) => ({
        ...s,
        recebidas: Number(s.recebidas),
        a_receber: Number(s.a_receber),
        utilizadas: Number(s.utilizadas),
        baixas: Number(s.baixas),
        transferidas: Number(s.transferidas),
        saldo: Number(s.saldo),
      }))}
      tecnicos={(tecnicosRes.data ?? []) as TecnicoPrograma[]}
    />
  );
}
