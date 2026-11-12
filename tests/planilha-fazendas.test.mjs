// Leitura da planilha de cadastro de fazendas (src/lib/planilha-fazendas.ts, 0056).
import { carregar, ok, terminar } from "./ts.mjs";

const p = await carregar("planilha-fazendas");

const r = p.lerFazendas([
  [],
  ["Propriedade", "Nome do produtor", "Cidade", "Estado", "Observação"],
  ["Fazenda Boa Vista", "João", "Quixadá", "ce", "x"],
  ["", "", "", "", ""],
  ["Sítio Sem Dono", "", "Tauá", "CE", ""],
  ["Sítio UF Ruim", "Ana", "Tauá", "Ceará", ""],
  ["  Sítio Espaço  ", " Beto ", "", "", ""],
]);
ok(r.linhas.length === 4, "linha vazia é pulada");
ok(r.colunasIgnoradas.length === 1 && r.colunasIgnoradas[0] === "Observação", "coluna desconhecida é avisada");
const [a, b, c, d] = r.linhas;
ok(a.linha === 3 && a.nome_propriedade === "Fazenda Boa Vista" && a.estado === "CE" && !a.erro, "apelidos e UF em maiúscula");
ok(b.linha === 5 && b.erro === "falta o nome do produtor", "sem produtor vira erro da linha (numeração do Excel)");
ok(typeof c.erro === "string" && c.erro.includes("UF"), "UF com mais de 2 letras vira erro");
ok(d.nome_propriedade === "Sítio Espaço" && d.nome_produtor === "Beto" && !d.erro, "espaços nas pontas saem");
ok(p.lerFazendas([[], []]).linhas.length === 0, "planilha vazia");

terminar("planilha-fazendas");
