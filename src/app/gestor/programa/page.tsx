import {
  getPropriedadesTodasCache,
  getTourosCache,
  getEntregasDosesTodasCache,
  getSaldoDosesTodasCache,
  getAdesoesTodasCache,
  getIndicadoresAtuaisCache,
  getBaixasDosesTodasCache,
  getIndicadoresReprodutivosTodasCache,
} from "@/lib/cached-data";
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
  ]);

  return (
    <ProgramaClient
      propriedades={propriedadesData as { id: string; nome_propriedade: string }[]}
      touros={tourosData as unknown as Touro[]}
      entregas={entregasData as unknown as EntregaDoses[]}
      saldos={saldosData as unknown as SaldoDoses[]}
      adesoes={adesoesData as unknown as Adesao[]}
      atuais={atuaisData as unknown as IndicadoresAtuais[]}
      baixas={baixasData as unknown as BaixaDoses[]}
      reprodutivos={reprodutivosData as unknown as IndicadoresReprodutivos[]}
      entidades={(entidadesData ?? []) as EntidadeOpcao[]}
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
