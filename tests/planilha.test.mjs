// Leitura da planilha de importação do rebanho (src/lib/planilha-rebanho.ts): colunas com outros
// nomes, datas em vários formatos e variações de escrita viram o formato que o banco (0045) espera.
import { carregar, ok, terminar } from "./ts.mjs";

const p = await carregar("planilha-rebanho");

ok(p.lerData("15/06/2026") === "2026-06-15", "DD/MM/AAAA");
ok(p.lerData("5/6/26") === "2026-06-05", "D/M/AA");
ok(p.lerData("2026-06-15") === "2026-06-15", "AAAA-MM-DD");
ok(p.lerData(46188) === "2026-06-15", "número de série do Excel");
ok(p.lerData(new Date(2026, 5, 15)) === "2026-06-15", "Date do SheetJS");
ok(p.lerData("31/02/2026") === null, "data impossível");
ok(p.lerData("ontem") === null, "texto que não é data");
ok(p.lerData("") === "", "vazia");

const dados = p.dadosVazios();
const r = p.lerTabela(
  [
    [],
    ["Nº", "Nome", "Status", "Mãe", "Data do parto", "Cobertura", "Touro", "Prenhez", "Observação"],
    [12, "Mimosa", "Em lactação", 5, "15/06/2026", "20/08/2026", "Tarzan", "Prenha", "boa vaca"],
    ["", "", "", "", "", "", "", "", ""],
    ["13.0", "", "SECA", "", "40/13/2025", "", "", "vazia", ""],
    [30, "", "novilha", "", "", "", "", "", ""],
  ],
  "vacas",
  dados,
);
ok(r.linhas === 3 && dados.vacas.length === 3, "linhas vazias são puladas");
ok(r.colunasIgnoradas.length === 1 && r.colunasIgnoradas[0] === "Observação", "coluna desconhecida é avisada");
const [v12, v13, v30] = dados.vacas;
ok(v12.linha === 3 && v12.numero === "12" && v12.situacao === "lactacao" && v12.numero_mae === "5", "vaca: número, situação e mãe");
ok(v12.data_parto === "2026-06-15" && v12.data_cobertura === "2026-08-20" && v12.diagnostico === "positivo", "vaca: datas e prenhez");
ok(v13.numero === "13" && v13.situacao === "seca" && v13.diagnostico === "negativo", "13.0 vira 13; SECA; vazia = negativo");
ok(typeof v13.erro === "string" && v13.erro.includes("não é uma data"), "data inválida vira erro da linha");
ok(v30.situacao === "novilha" && !v30.erro, "novilha sem parto");

const leite = p.dadosVazios();
p.lerTabela(p.tabelaDoTexto("Vaca\tData\tLitros\tOrdenha\n12\t01/10/2026\t18,5\tManhã\n12\t01/10/2026\t1.234,5\tT"), "leite", leite);
ok(leite.leite[0].litros === "18.5" && leite.leite[0].ordenha === "manha", "colado: 18,5 e Manhã");
ok(leite.leite[1].litros === "1234.5" && leite.leite[1].ordenha === "tarde", "milhar com ponto; T = tarde");

ok(p.abaPeloCabecalho(["Vaca", "Data", "Litros"]) === "leite", "aba de leite pelo cabeçalho");
ok(p.abaPeloCabecalho(["Número", "Sexo", "Nascimento"]) === "bezerros", "aba de bezerros pelo cabeçalho");
ok(p.abaPeloCabecalho(["Número", "Situação"]) === "vacas", "aba de vacas pelo cabeçalho");
ok(p.abaPeloNome("Pesagens") === "leite" && p.abaPeloNome("Bezerros") === "bezerros", "aba pelo nome");

terminar("planilha");
