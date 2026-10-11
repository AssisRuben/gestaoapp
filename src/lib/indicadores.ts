import { somarDias } from "./datas";

// Indicadores da lactação calculados AO VIVO (regra 5 do CLAUDE.md: nunca ler
// partos.projecao_305 / persistencia / dias_em_aberto gravados no banco).
//
// Diferença consciente em relação ao bot: a média diária é a média dos DIAS PESADOS (soma das
// ordenhas de cada dia ÷ nº de dias com pesagem), não "litros acumulados ÷ dias em lactação".
// Com pesagem diária as duas dão o mesmo número; com controle leiteiro semanal/mensal (comum no
// Balde Cheio) a conta do bot subestima a produção na proporção dos dias sem pesagem.

export const GESTACAO_DIAS = 283;
export const SECAGEM_ANTES_DO_PARTO = 60;

export type Pesagem = { data: string; litros: number };
export type CoberturaInd = { data_cobertura: string; diagnostico_prenhez: string };

export function diasEntre(de: string, ate: string) {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
}

// soma das ordenhas por dia → [{data, litros}] em ordem de data
export function totaisPorDia(pesagens: Pesagem[]): Pesagem[] {
  const m = new Map<string, number>();
  for (const p of pesagens) m.set(p.data, (m.get(p.data) ?? 0) + Number(p.litros));
  return [...m.entries()].map(([data, litros]) => ({ data, litros })).sort((a, b) => a.data.localeCompare(b.data));
}

function media(valores: number[]) {
  return valores.length ? valores.reduce((s, v) => s + v, 0) / valores.length : null;
}

export type IndicadoresLactacao = {
  del: number;
  diasPesados: number;
  litrosRegistrados: number;
  mediaDiaria: number | null;
  projecao305: number | null;
  persistencia: number | null;
  pico: Pesagem | null;
  ultima: Pesagem | null;
};

export function indicadoresLactacao(dataParto: string, pesagens: Pesagem[], hoje: string): IndicadoresLactacao {
  const dias = totaisPorDia(pesagens.filter((p) => p.data >= dataParto && p.data <= hoje));
  const del = diasEntre(dataParto, hoje);
  const mediaDiaria = media(dias.map((d) => d.litros));

  // persistência: últimos 30 dias ÷ 30 dias anteriores, só com 60+ dias de lactação e pesagem nas
  // duas janelas
  let persistencia: number | null = null;
  if (del >= 60) {
    const corte1 = somarDias(hoje, -30);
    const corte2 = somarDias(hoje, -60);
    const recente = media(dias.filter((d) => d.data > corte1).map((d) => d.litros));
    const anterior = media(dias.filter((d) => d.data > corte2 && d.data <= corte1).map((d) => d.litros));
    if (recente !== null && anterior !== null && anterior > 0) persistencia = (recente / anterior) * 100;
  }

  return {
    del,
    diasPesados: dias.length,
    litrosRegistrados: dias.reduce((s, d) => s + d.litros, 0),
    mediaDiaria,
    projecao305: mediaDiaria === null ? null : mediaDiaria * 305,
    persistencia,
    pico: dias.reduce<Pesagem | null>((m, d) => (m === null || d.litros > m.litros ? d : m), null),
    ultima: dias.length ? dias[dias.length - 1] : null,
  };
}

export type SituacaoReprodutiva =
  | { tipo: "prenhe"; cobertura: string; partoPrevisto: string; secarEm: string }
  | { tipo: "em_servico"; cobertura: string; diasDesdeCobertura: number }
  | { tipo: "vazia"; desde: string | null };

// Coberturas da lactação atual (a partir do parto ativo; sem parto, todas).
export function coberturasDaLactacao<T extends CoberturaInd>(coberturas: T[], dataParto: string | null): T[] {
  return coberturas
    .filter((c) => dataParto === null || c.data_cobertura >= dataParto)
    .sort((a, b) => b.data_cobertura.localeCompare(a.data_cobertura));
}

export function situacaoReprodutiva(
  coberturasLactacao: CoberturaInd[],
  dataParto: string | null,
  hoje: string,
): SituacaoReprodutiva {
  const ultima = coberturasLactacao[0];
  if (!ultima || ultima.diagnostico_prenhez === "negativo") {
    return { tipo: "vazia", desde: dataParto };
  }
  if (ultima.diagnostico_prenhez === "positivo") {
    const partoPrevisto = somarDias(ultima.data_cobertura, GESTACAO_DIAS);
    return {
      tipo: "prenhe",
      cobertura: ultima.data_cobertura,
      partoPrevisto,
      secarEm: somarDias(partoPrevisto, -SECAGEM_ANTES_DO_PARTO),
    };
  }
  return { tipo: "em_servico", cobertura: ultima.data_cobertura, diasDesdeCobertura: diasEntre(ultima.data_cobertura, hoje) };
}

// Dias em aberto: do parto até a cobertura que emprenhou; sem ela, continua contando até hoje.
export function diasEmAberto(coberturasLactacao: CoberturaInd[], dataParto: string, hoje: string) {
  const positiva = [...coberturasLactacao]
    .filter((c) => c.diagnostico_prenhez === "positivo")
    .sort((a, b) => b.data_cobertura.localeCompare(a.data_cobertura))[0];
  return positiva
    ? { dias: diasEntre(dataParto, positiva.data_cobertura), fechado: true }
    : { dias: diasEntre(dataParto, hoje), fechado: false };
}
