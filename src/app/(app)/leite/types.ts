export type { VacaOpcao } from "../vaca-opcao";

export type Periodo = "manha" | "tarde" | "dia_inteiro";

export type RegistroLeite = {
  id: string;
  vaca_id: string;
  parto_id: string;
  litros: number;
  data_controle: string;
  periodo: Periodo | null;
  created_at: string;
  vaca: { id: string; numero_identificacao: number };
};
