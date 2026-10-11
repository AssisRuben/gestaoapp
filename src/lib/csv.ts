// Planilha CSV que o Excel em português abre direto: separador ";", vírgula decimal, datas
// dd/mm/aaaa e BOM no começo (sem ele o Excel embaralha os acentos).

export type Celula = string | number | null | undefined;

function numero(valor: number) {
  if (!Number.isFinite(valor)) return "";
  // sem separador de milhar: o Excel lê "1234,5" como número; "1.234,5" às vezes vira texto
  return (Math.round(valor * 100) / 100).toString().replace(".", ",");
}

function data(valor: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor.slice(8, 10)}/${valor.slice(5, 7)}/${valor.slice(0, 4)}` : valor;
}

function celula(valor: Celula) {
  if (valor === null || valor === undefined) return "";
  const texto = typeof valor === "number" ? numero(valor) : data(String(valor));
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function paraCsv(cabecalho: string[], linhas: Celula[][]) {
  return "﻿" + [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n") + "\r\n";
}
