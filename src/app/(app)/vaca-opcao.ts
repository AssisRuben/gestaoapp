export type VacaOpcao = { id: string; numero_identificacao: number; nome?: string | null };

// "12 · Mimosa" quando a vaca tem nome; só "12" quando não tem. Usado em toda lista/campo que
// mostra a vaca (o bot continua só pelo número).
export function rotuloVaca(v: { numero_identificacao: number; nome?: string | null }): string {
  return rotuloNumeroNome(v.numero_identificacao, v.nome);
}

export function rotuloNumeroNome(numero: number | string | null | undefined, nome?: string | null): string {
  const n = numero === null || numero === undefined || numero === "" ? "" : String(numero);
  const nomeLimpo = nome?.trim();
  if (n && nomeLimpo) return `${n} · ${nomeLimpo}`;
  return n || nomeLimpo || "";
}
