// Perfil da fazenda (0053): as perguntas, as opções de resposta e o que falta responder. Usado no
// cadastro, no modal da fazenda, no lembrete do Início e no resumo da fazenda — servidor e navegador.

export type Opcao = readonly [valor: string, rotulo: string];

export const RACAS: readonly Opcao[] = [
  ["girolando", "Girolando"],
  ["holandes", "Holandês"],
  ["jersey", "Jersey"],
  ["gir", "Gir leiteiro"],
  ["mestica", "Mestiça sem padrão"],
  ["outra", "Outra"],
];

export const INSEMINACAO: readonly Opcao[] = [
  ["nao", "Não usa"],
  ["menos_1", "Sim, há menos de 1 ano"],
  ["1_3", "Sim, de 1 a 3 anos"],
  ["mais_3", "Sim, há mais de 3 anos"],
];

export const MAO_DE_OBRA: readonly Opcao[] = [
  ["familia", "Só a família"],
  ["familia_contratado", "Família + contratado"],
  ["contratado", "Só contratado"],
];

export const ORDENHA: readonly Opcao[] = [
  ["manual", "Manual"],
  ["mecanica", "Mecânica"],
];

export const ORDENHAS_DIA: readonly Opcao[] = [
  ["1", "1 por dia"],
  ["2", "2 por dia"],
  ["3", "3 por dia"],
];

export const DESTINO_LEITE: readonly Opcao[] = [
  ["laticinio", "Laticínio"],
  ["cooperativa", "Cooperativa"],
  ["queijeira", "Queijeira"],
  ["venda_direta", "Venda direta"],
  ["faz_queijo", "Faz queijo na fazenda"],
];

export const TANQUE: readonly Opcao[] = [
  ["sim", "Tem tanque próprio"],
  ["coletivo", "Usa tanque coletivo"],
  ["nao", "Não tem tanque"],
];

export type PerfilFazenda = {
  area_total_ha: number | null;
  area_leite_ha: number | null;
  irrigado: boolean | null;
  area_irrigada_ha: number | null;
  raca: string | null;
  inseminacao: string | null;
  mao_de_obra: string | null;
  pessoas: number | null;
  ordenha: string | null;
  ordenhas_dia: number | null;
  destino_leite: string | null;
  tanque: string | null;
  data_referencia: string | null;
  registrado_por_nome: string | null;
};

export const COLUNAS_PERFIL =
  "area_total_ha, area_leite_ha, irrigado, area_irrigada_ha, raca, inseminacao, mao_de_obra, pessoas, ordenha, ordenhas_dia, destino_leite, tanque, data_referencia, registrado_por_nome";

// perguntas do perfil (sem a área irrigada, que só vale pra quem irriga)
const PERGUNTAS: (keyof PerfilFazenda)[] = [
  "area_total_ha",
  "area_leite_ha",
  "irrigado",
  "raca",
  "inseminacao",
  "mao_de_obra",
  "pessoas",
  "ordenha",
  "ordenhas_dia",
  "destino_leite",
  "tanque",
];

export function perguntasFaltando(perfil: PerfilFazenda | null): number {
  if (!perfil) return PERGUNTAS.length + 1;
  const faltam = PERGUNTAS.filter((c) => perfil[c] === null || perfil[c] === undefined).length;
  return faltam + (perfil.irrigado && perfil.area_irrigada_ha === null ? 1 : 0);
}

export const rotuloDe = (opcoes: readonly Opcao[], valor: string | number | null) =>
  valor === null ? null : (opcoes.find(([v]) => v === String(valor))?.[1] ?? String(valor));

const ha = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha`;

// Linhas curtas pro resumo da fazenda ("Área: 20 ha, 12 ha pro leite", ...). Só o que foi respondido.
export function linhasPerfil(p: PerfilFazenda): { rotulo: string; valor: string }[] {
  const linhas: { rotulo: string; valor: string }[] = [];
  const area = [p.area_total_ha !== null ? ha(p.area_total_ha) : null, p.area_leite_ha !== null ? `${ha(p.area_leite_ha)} pro leite` : null]
    .filter(Boolean)
    .join(", ");
  if (area) linhas.push({ rotulo: "Área", valor: area });
  if (p.irrigado !== null) {
    linhas.push({
      rotulo: "Irrigação",
      valor: p.irrigado ? `Sim${p.area_irrigada_ha !== null ? `, ${ha(p.area_irrigada_ha)}` : ""}` : "Não",
    });
  }
  const pares: [string, readonly Opcao[], string | number | null][] = [
    ["Raça predominante", RACAS, p.raca],
    ["Inseminação", INSEMINACAO, p.inseminacao],
    ["Destino do leite", DESTINO_LEITE, p.destino_leite],
    ["Tanque", TANQUE, p.tanque],
  ];
  for (const [rotulo, opcoes, valor] of pares) {
    const r = rotuloDe(opcoes, valor);
    if (r) linhas.push({ rotulo, valor: r });
  }
  const mao = rotuloDe(MAO_DE_OBRA, p.mao_de_obra);
  if (mao || p.pessoas !== null) {
    linhas.push({
      rotulo: "Mão de obra",
      valor: [mao, p.pessoas !== null ? `${p.pessoas} ${p.pessoas === 1 ? "pessoa" : "pessoas"}` : null].filter(Boolean).join(", "),
    });
  }
  const ordenha = [rotuloDe(ORDENHA, p.ordenha), rotuloDe(ORDENHAS_DIA, p.ordenhas_dia)].filter(Boolean).join(", ");
  if (ordenha) linhas.push({ rotulo: "Ordenha", valor: ordenha });
  return linhas;
}
