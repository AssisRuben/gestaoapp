import { getPropriedadeAtual } from "@/lib/propriedade";
import { SemPropriedade } from "./sem-propriedade";
import {
  getVacasCache,
  getControleLeiteCache,
  getFinanceiroCache,
  getCoberturasCache,
  getBezerrosCache,
  getPartosCache,
} from "@/lib/cached-data";
import { DashboardClient } from "./dashboard-client";
import { hojeBrasil, somarDias } from "@/lib/datas";
import { coberturaAtualPorVaca } from "@/lib/indicadores";
import { carregarIndicadoresFazenda } from "@/lib/indicadores-fazenda";
import { IndicadoresFazendaView } from "../indicadores-fazenda-view";
import { createClient } from "@/lib/supabase/server";
import { COLUNAS_PERFIL, perguntasFaltando, type PerfilFazenda } from "@/lib/perfil-fazenda";
import { LembretePerfil } from "./lembrete-perfil";

export default async function DashboardPage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return <SemPropriedade />;
  }

  const hoje = hojeBrasil();

  const supabase = await createClient();
  const [vacasData, leiteData, financeiroData, coberturasData, bezerrosData, partosData, indicadores, perfilRes] = await Promise.all([
    getVacasCache(propriedadeAtual.id),
    getControleLeiteCache(propriedadeAtual.id),
    getFinanceiroCache(propriedadeAtual.id),
    getCoberturasCache(propriedadeAtual.id),
    getBezerrosCache(propriedadeAtual.id),
    getPartosCache(propriedadeAtual.id),
    carregarIndicadoresFazenda(propriedadeAtual.id),
    supabase.from("perfil_fazenda_atual").select(COLUNAS_PERFIL).eq("propriedade_id", propriedadeAtual.id).maybeSingle(),
  ]);
  // perfil da fazenda (0053): lembrete enquanto faltar resposta; sem a migration, nada aparece
  const perguntasPerfil = perfilRes.error ? 0 : perguntasFaltando(perfilRes.data as PerfilFazenda | null);

  const vacas = vacasData as unknown as { id: string; status_produtivo: string }[];
  const bezerros = bezerrosData as unknown as {
    sexo: string;
    vaca_id_gerada: string | null;
  }[];
  const registrosLeite = leiteData as unknown as { litros: number; data_controle: string }[];
  const lancamentos = financeiroData as unknown as {
    tipo: string;
    valor: number;
    data: string;
    categoria: string | null;
  }[];
  const coberturas = coberturasData as unknown as {
    id: string;
    vaca_id: string;
    data_cobertura: string;
    diagnostico_prenhez: string;
    vaca: { numero_identificacao: number };
  }[];

  const vacasEmLactacao = vacas.filter((v) => v.status_produtivo === "lactacao").length;
  const statusPorVacaId = new Map(vacas.map((v) => [v.id, v.status_produtivo]));

  const vacasTotal = vacas.length;
  // Bezerros que já viraram vaca (vaca_id_gerada preenchido) não contam de novo aqui —
  // já estão em `vacas`. Natimortos não entram porque não são animais vivos no plantel.
  const bezerrosVivos = bezerros.filter(
    (b) => b.sexo !== "natimorto" && b.vaca_id_gerada === null,
  ).length;
  const totalAnimais = vacasTotal + bezerrosVivos;

  const partos = partosData as unknown as {
    vaca_id: string;
    cobertura_id: string | null;
    data_parto: string;
    ativa: boolean;
  }[];

  // Cobertura que vale hoje pra cada vaca (lactação atual, sem a que já virou parto) — mesma regra
  // do resumo da fazenda.
  const coberturaAtual = [...coberturaAtualPorVaca(coberturas, partos).values()];

  // Vacas pra secar: cobertura atual confirmada (regra 7 do CLAUDE.md)
  const ultimaPositivaPorVaca = new Map(
    coberturaAtual
      .filter((c) => c.diagnostico_prenhez === "positivo")
      .map((c) => [c.vaca_id, { data_cobertura: c.data_cobertura, numero: c.vaca.numero_identificacao }]),
  );
  // Janela pelo parto previsto, não pela secagem: a vaca deve ser seca 60 dias
  // antes do parto, então avisar com 90 dias de antecedência do parto dá 30
  // dias de folga antes do prazo real de secagem. Mantém 5 dias de tolerância
  // pra depois do parto previsto, caso ainda não tenha sido seca a tempo.
  const inicioJanelaParto = somarDias(hoje, -5);
  const fimJanelaParto = somarDias(hoje, 90);
  const vacasPraSecar = [...ultimaPositivaPorVaca.entries()]
    .filter(([vacaId]) => statusPorVacaId.get(vacaId) === "lactacao")
    .map(([vacaId, info]) => {
      const partoPrevisto = somarDias(info.data_cobertura, 283);
      const secagemPrevista = somarDias(partoPrevisto, -60);
      return { vacaId, numero: info.numero, partoPrevisto, secagemPrevista };
    })
    .filter((v) => v.partoPrevisto >= inicioJanelaParto && v.partoPrevisto <= fimJanelaParto)
    .sort((a, b) => a.secagemPrevista.localeCompare(b.secagemPrevista));

  // Diagnósticos pendentes: só a cobertura atual de cada vaca (é nela que o diagnóstico vale —
  // regra 3); pendente antiga, já seguida de outra cobertura, não aparece de novo.
  const diagnosticosPendentes = coberturaAtual
    .filter((c) => c.diagnostico_prenhez === "pendente")
    .map((c) => ({ coberturaId: c.id, vacaId: c.vaca_id, numero: c.vaca.numero_identificacao, data_cobertura: c.data_cobertura }))
    .sort((a, b) => a.data_cobertura.localeCompare(b.data_cobertura));

  return (
    <DashboardClient
      propriedadeAtual={propriedadeAtual}
      vacasEmLactacao={vacasEmLactacao}
      vacasTotal={vacasTotal}
      totalAnimais={totalAnimais}
      registrosLeite={registrosLeite}
      lancamentos={lancamentos}
      vacasPraSecar={vacasPraSecar}
      diagnosticosPendentes={diagnosticosPendentes}
      indicadores={
        <>
          {perguntasPerfil > 0 && <LembretePerfil faltam={perguntasPerfil} />}
          <IndicadoresFazendaView indicadores={indicadores} />
        </>
      }
    />
  );
}
