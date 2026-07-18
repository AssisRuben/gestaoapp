export type StatusProdutivo = "novilha" | "lactacao" | "seca";
export type StatusReprodutivo = "vazia" | "prenhe" | "vazia_em_servico";

export type Vaca = {
  id: string;
  propriedade_id: string;
  mae_id: string | null;
  numero_identificacao: number;
  status_produtivo: StatusProdutivo;
  status_reprodutivo: StatusReprodutivo;
  data_parto: string | null;
  created_at: string;
  mae: { id: string; numero_identificacao: number } | null;
};
