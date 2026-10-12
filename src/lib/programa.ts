// Tipos do programa de doação de sêmen (supabase/migrations/0018_programa_semen.sql),
// compartilhados entre a aba Reprodução da fazenda e a aba Programa do gestor.

export type Touro = {
  id: string;
  nome: string;
  codigo: string | null;
  raca: string | null;
  central: string | null;
  pta_leite: number | null;
  ativo: boolean;
};

export type EntregaDoses = {
  id: string;
  propriedade_id: string;
  touro_id: string;
  quantidade: number;
  data_entrega: string;
  observacao: string | null;
  recebido_em: string | null;
  touro: { id: string; nome: string; codigo: string | null };
  propriedade?: { id: string; nome_propriedade: string };
  // a fazenda recebe pela entidade (associação, cooperativa…) — 0048
  entidade_id?: string | null;
  kits?: number | null;
  entidade?: { nome: string; responsavel: string | null; telefone: string | null } | null;
};

export type SaldoDoses = {
  propriedade_id: string;
  touro_id: string;
  recebidas: number;
  a_receber: number;
  utilizadas: number;
  baixas: number;
  saldo: number;
};

// Baixa de dose sem inseminação (0021_baixas_indicadores_programa.sql)
export const MOTIVOS_BAIXA = {
  perda: "Perda (dose danificada / falha no descongelamento)",
  descarte: "Descarte (vencida)",
  transferencia: "Repassada a outra propriedade",
  outro: "Outro",
} as const;

export type MotivoBaixa = keyof typeof MOTIVOS_BAIXA;

export type BaixaDoses = {
  id: string;
  propriedade_id: string;
  touro_id: string;
  quantidade: number;
  motivo: MotivoBaixa;
  data_baixa: string;
  observacao: string | null;
  touro: { id: string; nome: string; codigo: string | null };
  propriedade?: { id: string; nome_propriedade: string };
};

// Uma linha por fazenda da view indicadores_reprodutivos_programa (0021).
export type IndicadoresReprodutivos = {
  propriedade_id: string;
  doses_usadas: number;
  matrizes_inseminadas: number;
  prenhezes: number;
  negativos: number;
  pendentes: number;
  matrizes_prenhes: number;
  taxa_concepcao: number | null;
  doses_por_prenhez: number | null;
  gestacoes_em_curso: number;
  proximo_parto_previsto: string | null;
  nascimentos: number;
  femeas: number;
  machos: number;
  natimortos: number;
  femeas_no_rebanho: number;
};

export function rotuloTouro(touro: { nome: string; codigo: string | null }) {
  return touro.codigo ? `${touro.nome} (${touro.codigo})` : touro.nome;
}

// Linha de base / indicadores (supabase/migrations/0019_adesao_linha_base.sql). Mesmos campos na
// linha de base gravada e no cálculo de hoje, pra comparação lado a lado.
export const CAMPOS_INDICADORES = [
  { campo: "vacas_lactacao", rotulo: "Vacas em lactação", tipo: "inteiro", maiorMelhor: true },
  { campo: "litros_vaca_dia", rotulo: "Litros/vaca/dia", tipo: "litros", maiorMelhor: true },
  { campo: "producao_dia", rotulo: "Produção/dia (L)", tipo: "litros", maiorMelhor: true },
  { campo: "custo_litro", rotulo: "Custo por litro", tipo: "moeda", maiorMelhor: false },
  { campo: "receita_mensal", rotulo: "Receita mensal", tipo: "moeda", maiorMelhor: true },
  { campo: "despesa_mensal", rotulo: "Despesa mensal", tipo: "moeda", maiorMelhor: false },
  { campo: "total_animais", rotulo: "Total de animais", tipo: "inteiro", maiorMelhor: true },
  { campo: "matrizes", rotulo: "Matrizes", tipo: "inteiro", maiorMelhor: true },
  { campo: "novilhas", rotulo: "Novilhas", tipo: "inteiro", maiorMelhor: true },
  { campo: "bezerras", rotulo: "Bezerras", tipo: "inteiro", maiorMelhor: true },
] as const;

export type CampoIndicador = (typeof CAMPOS_INDICADORES)[number]["campo"];

export type Indicadores = Record<CampoIndicador, number | null>;

export type Adesao = Indicadores & {
  propriedade_id: string;
  data_adesao: string;
  observacao: string | null;
};

export type IndicadoresAtuais = Indicadores & { propriedade_id: string };
