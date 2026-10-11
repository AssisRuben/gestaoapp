// Planilhas exportadas pelo gestor (src/lib/csv.ts): formato que o Excel em português abre direto.
import { carregar, ok, terminar } from "./ts.mjs";

const { paraCsv } = await carregar("csv");
const csv = paraCsv(
  ["Fazenda", "Data", "Litros", "Obs"],
  [
    ["Fazenda Boa Esperança", "2026-10-11", 1234.567, null],
    ['Sítio "do Zé"; norte', "texto", 12, "linha\nquebrada"],
  ],
);

ok(csv.startsWith("﻿"), "começa com BOM (acentos certos no Excel)");
const linhas = csv.slice(1).split("\r\n");
ok(linhas[0] === "Fazenda;Data;Litros;Obs", "cabeçalho separado por ;");
ok(linhas[1] === "Fazenda Boa Esperança;11/10/2026;1234,57;", "data dd/mm/aaaa, vírgula decimal sem milhar, vazio pra nulo");
ok(csv.includes('"Sítio ""do Zé""; norte"'), "texto com ; e aspas vai entre aspas, com aspas dobradas");
ok(csv.includes('"linha\nquebrada"'), "quebra de linha dentro da célula fica entre aspas");
ok(csv.endsWith("\r\n"), "termina com quebra de linha");

terminar("csv");
