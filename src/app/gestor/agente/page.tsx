import { getInteracoesRecentesCache, getResumoFazendasCache } from "@/lib/cached-data";
import { normalizarResumo, hojeBrasil } from "@/lib/gestor";
import { formatarDataBR } from "../../(app)/format";
import { AgenteClient, type Interacao } from "./agente-client";

const DIAS_PERIODO = 30;

const formatarQuando = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// Dados reais de interacoes_log, últimos 30 dias. O layout do gestor já validou isGestor().
export default async function GestorAgentePage() {
  const hoje = hojeBrasil();
  const inicio = new Date(`${hoje}T00:00:00-03:00`);
  inicio.setUTCDate(inicio.getUTCDate() - (DIAS_PERIODO - 1));
  // começa à meia-noite: a chave do cache muda uma vez por dia, não a cada requisição
  const desde = inicio.toISOString();

  const [interacoesData, resumoData] = await Promise.all([
    getInteracoesRecentesCache(desde),
    getResumoFazendasCache(),
  ]);

  const nomes = new Map(normalizarResumo(resumoData).map((r) => [r.propriedade_id, r.nome_propriedade]));

  const linhas = interacoesData as {
    id: string;
    propriedade_id: string | null;
    intencao_detectada: string | null;
    mensagem_recebida: string | null;
    created_at: string;
  }[];

  const interacoes: Interacao[] = linhas.map((l, i) => ({
    id: l.id,
    fazenda: (l.propriedade_id && nomes.get(l.propriedade_id)) || "Sem fazenda identificada",
    intencao: l.intencao_detectada ?? "outro",
    mensagem: l.mensagem_recebida ?? "",
    quando: formatarQuando.format(new Date(l.created_at)).replace(",", ""),
    // já vem do mais recente pro mais antigo
    ordem: linhas.length - i,
  }));

  const fazendas = [...new Set(interacoes.map((i) => i.fazenda))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return (
    <AgenteClient
      interacoes={interacoes}
      fazendas={fazendas}
      periodo={`${formatarDataBR(inicio.toISOString().slice(0, 10))} a ${formatarDataBR(hoje)}`}
    />
  );
}
