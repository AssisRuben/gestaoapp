import type { CamposAutoria } from "../autoria";

export type TipoFinanceiro = "receita" | "despesa";

export type Lancamento = CamposAutoria & {
  id: string;
  propriedade_id: string;
  tipo: TipoFinanceiro;
  categoria: string | null;
  valor: number;
  data: string;
  created_at: string;
};
