export type { VacaOpcao } from "../vaca-opcao";
import type { CamposAutoria } from "../autoria";

export type Periodo = "manha" | "tarde" | "dia_inteiro";

export type RegistroLeite = CamposAutoria & {
  id: string;
  vaca_id: string;
  parto_id: string;
  litros: number;
  data_controle: string;
  periodo: Periodo | null;
  created_at: string;
  vaca: { id: string; numero_identificacao: number };
};
