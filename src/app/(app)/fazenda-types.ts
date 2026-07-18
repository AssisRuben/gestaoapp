export type UsuarioWhatsapp = {
  id: string;
  propriedade_id: string;
  telefone: string;
  papel: string;
  ativo: boolean;
  created_at: string;
};

export type PatrimonioItem = {
  id: string;
  propriedade_id: string;
  tipo_ativo: string | null;
  valor_total: number | null;
  taxa_juros: number | null;
  vida_util: number | null;
  created_at: string;
};
