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

// Tipos aceitos pelo banco (CHECK patrimonio_tipo_ativo_check, registrado em 0060).
export const TIPOS_ATIVO = [
  { valor: "terra", rotulo: "Terra" },
  { valor: "animais", rotulo: "Animais" },
  { valor: "maquinas", rotulo: "Máquinas" },
  { valor: "instalacoes", rotulo: "Instalações" },
] as const;

export function rotuloTipoAtivo(valor: string | null): string {
  if (!valor) return "—";
  return TIPOS_ATIVO.find((t) => t.valor === valor)?.rotulo ?? valor;
}

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
