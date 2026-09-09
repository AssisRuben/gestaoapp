export type { VacaOpcao } from "../vaca-opcao";

export type Sexo = "macho" | "femea" | "natimorto";

export type Bezerro = {
  id: string;
  propriedade_id: string;
  parto_id: string | null;
  mae_id: string | null;
  vaca_id_gerada: string | null;
  numero_identificacao: number | null;
  sexo: Sexo | null;
  data_nascimento: string | null;
  created_at: string;
  mae: { id: string; numero_identificacao: number } | null;
  vaca_gerada: { id: string; numero_identificacao: number } | null;
};
