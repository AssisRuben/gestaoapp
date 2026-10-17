export type UsuarioWhatsapp = {
  id: string;
  propriedade_id: string;
  telefone: string;
  papel: string;
  ativo: boolean;
  created_at: string;
};

export type Acesso = {
  usuario_id: string;
  email: string;
  nome: string | null;
  papel: string;
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
  // data e autor de quando foi salvo (trigger de autoria, 0053)
  criado_por?: string | null;
  criado_via?: string | null;
  atualizado_por?: string | null;
  atualizado_em?: string | null;
};
