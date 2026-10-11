export type { VacaOpcao } from "../vaca-opcao";
import type { CamposAutoria } from "../autoria";

export type DiagnosticoPrenhez = "pendente" | "positivo" | "negativo";

export type Cobertura = CamposAutoria & {
  id: string;
  vaca_id: string;
  data_cobertura: string;
  diagnostico_prenhez: DiagnosticoPrenhez;
  touro_semen: string | null;
  touro_id: string | null;
  dose_programa: boolean;
  created_at: string;
  vaca: { id: string; numero_identificacao: number };
};

export type Parto = CamposAutoria & {
  id: string;
  vaca_id: string;
  cobertura_id: string | null;
  data_parto: string;
  iep: number | null;
  ativa: boolean;
  created_at: string;
  vaca: { id: string; numero_identificacao: number };
};

export type { Touro, EntregaDoses, SaldoDoses, BaixaDoses } from "@/lib/programa";
