// Linhas das views agregadas de 0020_gestor_dados_reais.sql, já com numeric convertido pra
// number (o PostgREST pode devolver numeric como string).

export type ResumoFazenda = {
  propriedade_id: string;
  nome_propriedade: string;
  latitude: number | null;
  longitude: number | null;
  vacas_total: number;
  vacas_lactacao: number;
  bezerros_vivos: number;
  ultimo_leite: string | null;
  ultimo_financeiro: string | null;
  iep_soma: number | null;
  iep_qtd: number;
  telefone: string | null;
};

export type LeiteDiario = { propriedade_id: string; data: string; litros: number; pesagens: number };

export type FinanceiroDiario = {
  propriedade_id: string;
  data: string;
  receita: number;
  despesa: number;
};

type Linha = Record<string, unknown>;

const numeroOuNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function normalizarResumo(linhas: Linha[]): ResumoFazenda[] {
  return linhas.map((l) => ({
    ...(l as ResumoFazenda),
    latitude: numeroOuNull(l.latitude),
    longitude: numeroOuNull(l.longitude),
    iep_soma: numeroOuNull(l.iep_soma),
  }));
}

export function normalizarLeite(linhas: Linha[]): LeiteDiario[] {
  return linhas.map((l) => ({
    propriedade_id: l.propriedade_id as string,
    data: l.data as string,
    litros: Number(l.litros),
    pesagens: Number(l.pesagens),
  }));
}

export function normalizarFinanceiro(linhas: Linha[]): FinanceiroDiario[] {
  return linhas.map((l) => ({
    propriedade_id: l.propriedade_id as string,
    data: l.data as string,
    receita: Number(l.receita),
    despesa: Number(l.despesa),
  }));
}

// "YYYY-MM-DD" de hoje no fuso do Brasil (o servidor roda em UTC; depois das 21h o dia em UTC
// já virou e "hoje" sairia um dia adiantado).
export function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());
}

export function diasEntre(de: string, ate: string) {
  return Math.round(
    (new Date(`${ate}T00:00:00Z`).getTime() - new Date(`${de}T00:00:00Z`).getTime()) / 86400000,
  );
}
