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
    />
  );
}
