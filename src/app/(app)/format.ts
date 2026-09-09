// Formata uma data armazenada como "YYYY-MM-DD" (coluna `date` do Postgres)
// para exibição em pt-BR (dd/mm/yyyy). Só para mostrar pra humano em
// tabela/card — nunca usar isso pra cálculo (não faz parse de Date real,
// só rearranja a string, evitando qualquer risco de fuso-horário).
export function formatarDataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}
