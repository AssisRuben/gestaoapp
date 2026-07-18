export type { VacaOpcao } from "../vaca-opcao";

export type DiagnosticoPrenhez = "pendente" | "positivo" | "negativo";

export type Cobertura = {
  id: string;
  vaca_id: string;
  data_cobertura: string;
  diagnostico_prenhez: DiagnosticoPrenhez;
  touro_semen: string | null;
  created_at: string;
  vaca: { id: string; numero_identificacao: number };
};

export type Parto = {
  id: string;
  vaca_id: string;
  cobertura_id: string | null;
  data_parto: string;
  iep: number | null;
  ativa: boolean;
  created_at: string;
  vaca: { id: string; numero_identificacao: number };
};
