import {
  getPropriedadesTodasCache,
  getVacasTodasCache,
  getBezerrosTodasCache,
  getControleLeiteTodasCache,
  getFinanceiroTodasCache,
  getPartosTodasCache,
} from "@/lib/cached-data";
import { GestorDashboardClient } from "./gestor-dashboard-client";

export default async function GestorDashboardPage() {
  const [propriedadesData, vacasData, bezerrosData, leiteData, financeiroData, partosData] =
    await Promise.all([
      getPropriedadesTodasCache(),
      getVacasTodasCache(),
      getBezerrosTodasCache(),
      getControleLeiteTodasCache(),
      getFinanceiroTodasCache(),
      getPartosTodasCache(),
    ]);

  const propriedades = propriedadesData as unknown as {
    id: string;
    nome_propriedade: string;
    latitude: number | null;
    longitude: number | null;
  }[];
  const vacas = vacasData as unknown as { propriedade_id: string; status_produtivo: string }[];
  const bezerros = bezerrosData as unknown as {
    propriedade_id: string;
    sexo: string;
    vaca_id_gerada: string | null;
  }[];
  const registrosLeite = leiteData as unknown as {
    litros: number;
    data_controle: string;
    vaca: { propriedade_id: string } | null;
  }[];
  const lancamentos = financeiroData as unknown as {
    propriedade_id: string;
    tipo: string;
    valor: number;
    data: string;
  }[];
  const partos = partosData as unknown as { iep: number | null }[];

  const iepsValidos = partos.map((p) => p.iep).filter((iep): iep is number => iep !== null);
  const iepMedio = iepsValidos.length
    ? iepsValidos.reduce((soma, iep) => soma + iep, 0) / iepsValidos.length
    : null;

  const fazendas = propriedades.map((p) => {
    const vacasDaFazenda = vacas.filter((v) => v.propriedade_id === p.id);
    const vacasTotal = vacasDaFazenda.length;
    const vacasEmLactacao = vacasDaFazenda.filter((v) => v.status_produtivo === "lactacao").length;
    const bezerrosVivos = bezerros.filter(
      (b) => b.propriedade_id === p.id && b.sexo !== "natimorto" && b.vaca_id_gerada === null,
    ).length;

    return {
      id: p.id,
      nome_propriedade: p.nome_propriedade,
      latitude: p.latitude,
      longitude: p.longitude,
      vacasTotal,
      vacasEmLactacao,
      totalAnimais: vacasTotal + bezerrosVivos,
    };
  });

  const registrosLeiteComFazenda = registrosLeite
    .filter((r) => r.vaca?.propriedade_id)
    .map((r) => ({
      propriedade_id: r.vaca!.propriedade_id,
      litros: Number(r.litros),
      data_controle: r.data_controle,
    }));

  const lancamentosComFazenda = lancamentos.map((l) => ({
    propriedade_id: l.propriedade_id,
    tipo: l.tipo,
    valor: Number(l.valor),
    data: l.data,
  }));

  return (
    <GestorDashboardClient
      fazendas={fazendas}
      registrosLeite={registrosLeiteComFazenda}
      lancamentos={lancamentosComFazenda}
      iepMedio={iepMedio}
    />
  );
}
