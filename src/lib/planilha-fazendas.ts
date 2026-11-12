// Leitura da planilha de cadastro de fazendas (tela Cadastrar fazendas, técnico autorizado — 0056).
// Só entende o FORMATO (colunas com outros nomes, linhas vazias); nome repetido, fazenda que já existe
// e permissão são conferidos pelo banco (tecnico_criar_fazendas).
import { chave, type Celula } from "./planilha-rebanho";

export type LinhaFazenda = {
  linha: number;
  nome_propriedade: string;
  nome_produtor: string;
  municipio: string;
  estado: string;
  tecnico_responsavel: string;
  erro?: string;
};

export const COLUNAS_FAZENDA: { campo: keyof Omit<LinhaFazenda, "linha" | "erro">; titulo: string; apelidos: string[] }[] = [
  { campo: "nome_propriedade", titulo: "Fazenda", apelidos: ["fazenda", "propriedade", "nomedafazenda", "nomepropriedade", "nomefazenda", "sitio"] },
  { campo: "nome_produtor", titulo: "Produtor", apelidos: ["produtor", "nomedoprodutor", "nomeprodutor", "proprietario", "dono"] },
  { campo: "municipio", titulo: "Município", apelidos: ["municipio", "cidade"] },
  { campo: "estado", titulo: "UF", apelidos: ["uf", "estado"] },
  { campo: "tecnico_responsavel", titulo: "Técnico responsável", apelidos: ["tecnico", "tecnicoresponsavel", "responsavel"] },
];

export const MODELO_FAZENDAS: string[][] = [
  COLUNAS_FAZENDA.map((c) => c.titulo),
  ["Fazenda Boa Vista", "João da Silva", "Quixadá", "CE", "Alex"],
  ["Sítio Santa Luzia", "Maria Souza", "Tauá", "CE", "Alex"],
];

export const INSTRUCOES_FAZENDAS: string[][] = [
  ["Como preencher"],
  ["Uma fazenda por linha. Fazenda e Produtor são obrigatórios; o resto é opcional."],
  ["Apague as linhas de exemplo antes de enviar."],
  ["Essas fazendas ficam SEM WhatsApp e sem acesso do produtor: só você (técnico) vê e lança os dados."],
  ["Se a fazenda já existe no mesmo município, a linha é recusada (evita cadastrar duas vezes)."],
];

const texto = (v: Celula) => (v === null || v === undefined ? "" : String(v).trim());

// Primeira linha não vazia = cabeçalho. Devolve as linhas preenchidas (as vazias são puladas, mas o
// número da linha conta a planilha toda, pra bater com o que a pessoa vê no Excel).
export function lerFazendas(tabela: Celula[][]): { linhas: LinhaFazenda[]; colunasIgnoradas: string[] } {
  const iCab = tabela.findIndex((l) => l.some((c) => texto(c) !== ""));
  if (iCab < 0) return { linhas: [], colunasIgnoradas: [] };

  const cab = tabela[iCab];
  const indice = new Map<string, number>();
  const ignoradas: string[] = [];
  cab.forEach((c, i) => {
    const t = texto(c);
    if (!t) return;
    const k = chave(t);
    const col = COLUNAS_FAZENDA.find((x) => x.apelidos.includes(k) || chave(x.titulo) === k);
    if (col && !indice.has(col.campo)) indice.set(col.campo, i);
    else ignoradas.push(t);
  });

  const linhas: LinhaFazenda[] = [];
  for (let i = iCab + 1; i < tabela.length; i++) {
    const row = tabela[i];
    if (!row.some((c) => texto(c) !== "")) continue;
    const v = (campo: string) => {
      const j = indice.get(campo);
      return j === undefined ? "" : texto(row[j]);
    };
    const l: LinhaFazenda = {
      linha: i + 1,
      nome_propriedade: v("nome_propriedade"),
      nome_produtor: v("nome_produtor"),
      municipio: v("municipio"),
      estado: v("estado").toUpperCase(),
      tecnico_responsavel: v("tecnico_responsavel"),
    };
    if (!l.nome_propriedade) l.erro = "falta o nome da fazenda";
    else if (!l.nome_produtor) l.erro = "falta o nome do produtor";
    else if (l.estado && l.estado.length !== 2) l.erro = `UF "${l.estado}" inválida — use 2 letras (ex.: CE)`;
    linhas.push(l);
  }
  return { linhas, colunasIgnoradas: ignoradas };
}
