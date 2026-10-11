// "Hoje" no fuso das fazendas. new Date().toISOString() é UTC: depois das 21h no Ceará já
// devolve o dia seguinte, e os formulários vinham com a data de amanhã.
const FUSO = "America/Fortaleza";

export function hojeBrasil() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date());
}

export function primeiroDiaMesBrasil() {
  return `${hojeBrasil().slice(0, 7)}-01`;
}

// Soma dias a uma data YYYY-MM-DD sem passar por fuso (meio-dia UTC nunca vira outro dia).
export function somarDias(data: string, dias: number) {
  const d = new Date(`${data}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
