// Formata uma data armazenada como "YYYY-MM-DD" (coluna `date` do Postgres)
// para exibição em pt-BR (dd/mm/yyyy). Só para mostrar pra humano em
// tabela/card — nunca usar isso pra cálculo (não faz parse de Date real,
// só rearranja a string, evitando qualquer risco de fuso-horário).
export function formatarDataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Telefone gravado normalizado ("5585998149317", ver 0024) → "(85) 99814-9317".
export function formatarTelefoneBR(telefone: string): string {
  const d = telefone.replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return telefone;
}
