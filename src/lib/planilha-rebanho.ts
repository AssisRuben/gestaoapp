// Leitura da planilha de importação do rebanho (tela Vacas → Importar planilha). Funções puras:
// recebem as linhas já lidas (do .xlsx pelo SheetJS, do .csv ou do texto colado) e devolvem o que
// vai pra função importar_rebanho do banco (0045). Aqui só se entende o FORMATO (colunas, datas,
// variações de escrita); as regras do rebanho (número repetido, parto obrigatório...) são do banco.

export type Celula = string | number | boolean | Date | null | undefined;

export type LinhaVaca = {
  linha: number;
  numero: string;
  nome: string;
  situacao: string;
  numero_mae: string;
  data_parto: string;
  bezerro_numero: string;
  bezerro_sexo: string;
  data_cobertura: string;
  touro: string;
  diagnostico: string;
  erro?: string;
};

export type LinhaBezerro = {
  linha: number;
  numero: string;
  sexo: string;
  data_nascimento: string;
  numero_mae: string;
  erro?: string;
};

export type LinhaLeite = {
  linha: number;
  numero_vaca: string;
  data: string;
  litros: string;
  ordenha: string;
  erro?: string;
};

export type DadosImportacao = { vacas: LinhaVaca[]; bezerros: LinhaBezerro[]; leite: LinhaLeite[] };
export type Aba = keyof DadosImportacao;

// Cabeçalhos do modelo e os jeitos comuns de escrever cada um (comparados sem acento/espaço).
export const COLUNAS: Record<Aba, { campo: string; titulo: string; apelidos: string[] }[]> = {
  vacas: [
    { campo: "numero", titulo: "Número", apelidos: ["numero", "n", "no", "num", "brinco", "numerovaca", "vaca"] },
    { campo: "nome", titulo: "Nome", apelidos: ["nome", "apelido"] },
    { campo: "situacao", titulo: "Situação", apelidos: ["situacao", "status", "statusprodutivo", "categoria"] },
    { campo: "numero_mae", titulo: "Mãe (número)", apelidos: ["mae", "maenumero", "numeromae", "numerodamae"] },
    { campo: "data_parto", titulo: "Último parto", apelidos: ["ultimoparto", "dataparto", "datadoparto", "parto", "datadoultimoparto"] },
    { campo: "bezerro_numero", titulo: "Bezerro do parto (número)", apelidos: ["bezerrodoparto", "bezerrodopartonumero", "numerobezerro", "bezerronumero", "cria"] },
    { campo: "bezerro_sexo", titulo: "Bezerro do parto (sexo)", apelidos: ["bezerrodopartosexo", "sexobezerro", "bezerrosexo", "sexodacria"] },
    { campo: "data_cobertura", titulo: "Última cobertura", apelidos: ["ultimacobertura", "datacobertura", "datadacobertura", "cobertura", "inseminacao", "datainseminacao"] },
    { campo: "touro", titulo: "Touro", apelidos: ["touro", "semen", "tourosemen"] },
    { campo: "diagnostico", titulo: "Diagnóstico", apelidos: ["diagnostico", "prenhez", "toque", "resultado"] },
  ],
  bezerros: [
    { campo: "numero", titulo: "Número", apelidos: ["numero", "n", "no", "num", "brinco", "bezerro"] },
    { campo: "sexo", titulo: "Sexo", apelidos: ["sexo"] },
    { campo: "data_nascimento", titulo: "Nascimento", apelidos: ["nascimento", "datanascimento", "datadenascimento", "nasceu"] },
    { campo: "numero_mae", titulo: "Mãe (número)", apelidos: ["mae", "maenumero", "numeromae", "numerodamae"] },
  ],
  leite: [
    { campo: "numero_vaca", titulo: "Vaca (número)", apelidos: ["vaca", "vacanumero", "numerovaca", "numero", "brinco"] },
    { campo: "data", titulo: "Data", apelidos: ["data", "dia", "datapesagem", "datadapesagem"] },
    { campo: "litros", titulo: "Litros", apelidos: ["litros", "leite", "producao", "kg", "l"] },
    { campo: "ordenha", titulo: "Ordenha", apelidos: ["ordenha", "periodo", "turno"] },
  ],
};

export const NOME_ABA: Record<Aba, string> = { vacas: "Vacas", bezerros: "Bezerros", leite: "Leite" };

export function chave(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function texto(valor: Celula): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return valor.toISOString();
  return String(valor).trim();
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

function isoValida(ano: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

// Data do Excel (Date do SheetJS ou número serial), DD/MM/AAAA, DD/MM/AA, D/M/AAAA ou AAAA-MM-DD.
// Devolve AAAA-MM-DD, "" se vazia, ou null se não deu pra entender.
export function lerData(valor: Celula): string | null {
  if (valor === null || valor === undefined || valor === "") return "";
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return isoValida(valor.getFullYear(), valor.getMonth() + 1, valor.getDate());
  }
  if (typeof valor === "number") {
    // serial do Excel: dias desde 30/12/1899
    if (valor < 1 || valor > 100000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(valor) * 86_400_000);
    return isoValida(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const t = String(valor).trim();
  if (t === "") return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isoValida(Number(m[1]), Number(m[2]), Number(m[3]));
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    let ano = Number(m[3]);
    if (m[3].length === 2) ano += ano > 50 ? 1900 : 2000;
    return isoValida(ano, Number(m[2]), Number(m[1]));
  }
  return null;
}

function normalizarSituacao(t: string) {
  const k = chave(t);
  if (!k) return "";
  if (k.includes("lact") || k === "produzindo" || k === "ordenha") return "lactacao";
  if (k.includes("seca") || k === "seco") return "seca";
  if (k.includes("novilh") || k === "bezerra" || k === "nulipara") return "novilha";
  return t;
}

function normalizarDiagnostico(t: string) {
  const k = chave(t);
  if (!k) return "";
  if (["prenhe", "prenha", "positivo", "positiva", "sim", "confirmada", "p"].includes(k)) return "positivo";
  if (["vazia", "negativo", "negativa", "nao", "n", "falhou"].includes(k)) return "negativo";
  if (["pendente", "aguardando", "afazer", "semdiagnostico"].includes(k)) return "pendente";
  return t;
}

function normalizarSexo(t: string) {
  const k = chave(t);
  if (!k) return "";
  if (["macho", "m", "bezerro", "boi", "touro"].includes(k)) return "macho";
  if (["femea", "f", "bezerra", "novilha"].includes(k)) return "femea";
  if (["natimorto", "morto", "morta", "nm"].includes(k)) return "natimorto";
  return t;
}

function normalizarOrdenha(t: string) {
  const k = chave(t);
  if (!k) return "";
  if (["manha", "m", "1", "1a", "primeira", "cedo"].includes(k)) return "manha";
  if (["tarde", "t", "2", "2a", "segunda", "noite"].includes(k)) return "tarde";
  if (["dia", "diainteiro", "total", "diatodo", "d"].includes(k)) return "dia_inteiro";
  return t;
}

function lerNumero(valor: Celula) {
  const t = texto(valor).replace(/\s/g, "");
  if (!t) return "";
  // 12,5 / 1.234,5 → 12.5 / 1234.5
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return t.replace(/\./g, "").replace(",", ".");
  return t.replace(",", ".");
}

// Descobre a aba pelas colunas do cabeçalho (quando o nome da aba não diz).
export function abaPeloCabecalho(cabecalho: Celula[]): Aba | null {
  const ks = new Set(cabecalho.map((c) => chave(texto(c))));
  if (["litros", "leite", "producao"].some((k) => ks.has(k))) return "leite";
  if (ks.has("sexo") && !ks.has("situacao")) return "bezerros";
  if (["situacao", "status", "ultimoparto", "dataparto", "categoria"].some((k) => ks.has(k))) return "vacas";
  return null;
}

export function abaPeloNome(nome: string): Aba | null {
  const k = chave(nome);
  if (k.startsWith("vaca") || k.includes("rebanho") || k.includes("matriz")) return "vacas";
  if (k.startsWith("bezerr") || k.includes("cria")) return "bezerros";
  if (k.includes("leite") || k.includes("pesage") || k.includes("controle")) return "leite";
  return null;
}

export type ResultadoLeitura = { aba: Aba; linhas: number; colunasIgnoradas: string[] };

// Uma tabela (linhas × colunas) → linhas da aba. A primeira linha não vazia é o cabeçalho; o número
// de cada linha é o da planilha (pra pessoa achar o erro).
export function lerTabela(
  tabela: Celula[][],
  aba: Aba,
  destino: DadosImportacao,
): ResultadoLeitura {
  const inicio = tabela.findIndex((l) => l.some((c) => texto(c) !== ""));
  if (inicio < 0) return { aba, linhas: 0, colunasIgnoradas: [] };

  const cabecalho = tabela[inicio].map((c) => texto(c));
  const indice = new Map<string, number>();
  const ignoradas: string[] = [];
  cabecalho.forEach((titulo, i) => {
    if (!titulo) return;
    const k = chave(titulo);
    const col = COLUNAS[aba].find((c) => chave(c.titulo) === k || c.apelidos.includes(k));
    if (col && !indice.has(col.campo)) indice.set(col.campo, i);
    else ignoradas.push(titulo);
  });

  const valor = (linha: Celula[], campo: string): Celula => {
    const i = indice.get(campo);
    return i === undefined ? undefined : linha[i];
  };

  let contadas = 0;
  for (let i = inicio + 1; i < tabela.length; i++) {
    const linha = tabela[i];
    if (!linha || !linha.some((c) => texto(c) !== "")) continue;
    const numeroLinha = i + 1;
    const erros: string[] = [];
    const data = (campo: string, rotulo: string) => {
      const d = lerData(valor(linha, campo));
      if (d === null) {
        erros.push(`${rotulo} "${texto(valor(linha, campo))}" não é uma data — use DD/MM/AAAA`);
        return "";
      }
      return d;
    };
    const inteiro = (campo: string) => texto(valor(linha, campo)).replace(/\.0+$/, "");

    if (aba === "vacas") {
      destino.vacas.push({
        linha: numeroLinha,
        numero: inteiro("numero"),
        nome: texto(valor(linha, "nome")),
        situacao: normalizarSituacao(texto(valor(linha, "situacao"))),
        numero_mae: inteiro("numero_mae"),
        data_parto: data("data_parto", "Último parto"),
        bezerro_numero: inteiro("bezerro_numero"),
        bezerro_sexo: normalizarSexo(texto(valor(linha, "bezerro_sexo"))),
        data_cobertura: data("data_cobertura", "Última cobertura"),
        touro: texto(valor(linha, "touro")),
        diagnostico: normalizarDiagnostico(texto(valor(linha, "diagnostico"))),
        ...(erros.length ? { erro: erros.join("; ") } : {}),
      });
    } else if (aba === "bezerros") {
      destino.bezerros.push({
        linha: numeroLinha,
        numero: inteiro("numero"),
        sexo: normalizarSexo(texto(valor(linha, "sexo"))),
        data_nascimento: data("data_nascimento", "Nascimento"),
        numero_mae: inteiro("numero_mae"),
        ...(erros.length ? { erro: erros.join("; ") } : {}),
      });
    } else {
      destino.leite.push({
        linha: numeroLinha,
        numero_vaca: inteiro("numero_vaca"),
        data: data("data", "Data"),
        litros: lerNumero(valor(linha, "litros")),
        ordenha: normalizarOrdenha(texto(valor(linha, "ordenha"))),
        ...(erros.length ? { erro: erros.join("; ") } : {}),
      });
    }
    contadas++;
  }
  return { aba, linhas: contadas, colunasIgnoradas: ignoradas };
}

// Texto colado de uma planilha (células separadas por TAB) ou CSV (";" do Excel em português, ou
// ","). Aspas em volta da célula são tiradas.
export function tabelaDoTexto(t: string): Celula[][] {
  const linhas = t.replace(/^﻿/, "").replace(/\r\n?/g, "\n").split("\n");
  const separador = linhas.some((l) => l.includes("\t")) ? "\t" : linhas.some((l) => l.includes(";")) ? ";" : ",";
  return linhas.map((l) => l.split(separador).map((c) => c.trim().replace(/^"(.*)"$/, "$1")));
}

export function dadosVazios(): DadosImportacao {
  return { vacas: [], bezerros: [], leite: [] };
}

// Modelo pra baixar: cabeçalhos + uma linha de exemplo por aba.
export const MODELO: Record<Aba, (string | number)[][]> = {
  vacas: [
    COLUNAS.vacas.map((c) => c.titulo),
    [12, "Mimosa", "Lactação", 13, "15/06/2026", 105, "Fêmea", "20/08/2026", "Tarzan", "Prenhe"],
    [13, "", "Seca", "", "10/12/2025", "", "", "", "", ""],
    [30, "Estrela", "Novilha", 12, "", "", "", "", "", ""],
  ],
  bezerros: [COLUNAS.bezerros.map((c) => c.titulo), [210, "Fêmea", "10/12/2025", 13]],
  leite: [COLUNAS.leite.map((c) => c.titulo), [12, "01/10/2026", "18,5", "Manhã"], [12, "01/10/2026", "9", "Tarde"]],
};

export const INSTRUCOES: string[][] = [
  ["Como preencher"],
  ["Vacas: uma linha por vaca. Número e Situação são obrigatórios."],
  ["Situação: Lactação, Seca ou Novilha."],
  ["Vaca em lactação precisa do Último parto (pode ser data aproximada)."],
  ["Bezerro do parto: preencha só se quiser cadastrar o bezerro desse parto (número e sexo)."],
  ["Última cobertura, Touro e Diagnóstico (Prenhe, Vazia ou Pendente): só da gestação atual, depois do último parto."],
  ["Bezerros: bezerros e bezerras que ainda não viraram vaca. Sexo: Macho, Fêmea ou Natimorto."],
  ["Leite: pesagens da lactação atual. Ordenha: Manhã, Tarde ou Dia inteiro (pode deixar vazio)."],
  ["Datas no formato DD/MM/AAAA. Litros com vírgula ou ponto."],
  ["Pode apagar as linhas de exemplo. Abas vazias são ignoradas."],
];
