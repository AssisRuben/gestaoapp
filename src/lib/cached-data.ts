import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

// Busca cada tabela com service role (ignora RLS) dentro de unstable_cache —
// unstable_cache não permite cookies()/headers() dentro da função cacheada,
// então não dá pra usar o cliente autenticado do usuário aqui. Quem chama
// essas funções já validou, via getPropriedadeAtual() (RLS normal), que o
// usuário tem acesso à propriedadeId passada — o filtro por propriedade_id
// abaixo é o que garante o isolamento entre fazendas nessas leituras.
//
// Tag por tabela (não por propriedade): salvar/editar/deletar em QUALQUER
// fazenda invalida o cache de todas — mais simples, e como são poucas
// fazendas o custo é uma revalidação a mais, não um bug de dado incorreto.
const REVALIDATE_SEGUNDOS = 30;

// O PostgREST devolve no máximo 1000 linhas por consulta (max_rows, padrão do Supabase) e corta
// o resto sem erro — uma fazenda com 30 vacas pesadas todo dia passa disso em pouco mais de um
// mês. Por isso TODA leitura de lista aqui pagina até acabar. A ordenação precisa ser total
// (terminar num campo único, como id) pra paginação não pular nem repetir linha.
const TAMANHO_PAGINA = 1000;

async function buscarTodasPaginas<T>(
  pagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const linhas: T[] = [];
  for (let de = 0; ; de += TAMANHO_PAGINA) {
    const { data, error } = await pagina(de, de + TAMANHO_PAGINA - 1);
    // melhor a tela dar erro do que mostrar total pela metade sem ninguém perceber
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < TAMANHO_PAGINA) return linhas;
  }
}

export const getVacasCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("vacas")
        .select("*, mae:mae_id(id, numero_identificacao)")
        .eq("propriedade_id", propriedadeId)
        .order("numero_identificacao")
        .order("id")
        .range(de, ate),
    );
  },
  ["vacas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["vacas"] },
);

export const getBezerrosCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("bezerros")
        .select(
          "*, mae:mae_id(id, numero_identificacao), vaca_gerada:vaca_id_gerada(id, numero_identificacao)",
        )
        .eq("propriedade_id", propriedadeId)
        .order("numero_identificacao")
        .order("id")
        .range(de, ate),
    );
  },
  ["bezerros-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["bezerros"] },
);

export const getControleLeiteCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("controle_leite")
        .select("*, vaca:vaca_id!inner(id, numero_identificacao, propriedade_id)")
        .eq("vaca.propriedade_id", propriedadeId)
        .order("numero_identificacao", { foreignTable: "vaca" })
        .order("data_controle", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["controle-leite-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["leite"] },
);

export const getFinanceiroCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("financeiro")
        .select("*")
        .eq("propriedade_id", propriedadeId)
        .order("data", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["financeiro-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["financeiro"] },
);

export const getCoberturasCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("coberturas")
        .select("*, vaca:vaca_id!inner(id, numero_identificacao, propriedade_id)")
        .eq("vaca.propriedade_id", propriedadeId)
        .order("numero_identificacao", { foreignTable: "vaca" })
        .order("data_cobertura", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["coberturas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["coberturas"] },
);

export const getPartosCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("partos")
        .select("*, vaca:vaca_id!inner(id, numero_identificacao, propriedade_id)")
        .eq("vaca.propriedade_id", propriedadeId)
        .order("numero_identificacao", { foreignTable: "vaca" })
        .order("data_parto", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["partos-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["partos"] },
);

// Programa de sêmen (0018_programa_semen.sql). O catálogo de touros é central, sem
// propriedade_id — qualquer usuário logado pode ler.
export const getTourosCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase.from("touros").select("*").order("nome").order("id").range(de, ate),
    );
  },
  ["touros-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["touros"] },
);

export const getEntregasDosesCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("entregas_doses")
        .select("*, touro:touro_id(id, nome, codigo)")
        .eq("propriedade_id", propriedadeId)
        .order("data_entrega", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["entregas-doses-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["entregas_doses"] },
);

// Saldo depende das entregas, das coberturas (doses gastas) e das baixas — invalida com qualquer uma.
export const getSaldoDosesCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("saldo_doses")
        .select("*")
        .eq("propriedade_id", propriedadeId)
        .order("touro_id")
        .range(de, ate),
    );
  },
  ["saldo-doses-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["entregas_doses", "coberturas", "baixas_doses"] },
);

export const getBaixasDosesCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("baixas_doses")
        .select("*, touro:touro_id(id, nome, codigo)")
        .eq("propriedade_id", propriedadeId)
        .order("data_baixa", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["baixas-doses-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["baixas_doses"] },
);

// Fetchers "todas as propriedades" — usados só pelo dashboard do gestor (ver
// supabase/migrations/0017_gestor.sql). Mesmo padrão dos fetchers de uma fazenda só, sem o
// .eq("propriedade_id", ...): quem chama já validou isGestor() antes (mesmo papel que
// getPropriedadeAtual() cumpre pras fetchers de uma fazenda só).
export const getPropriedadesTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("propriedades")
        .select("id, nome_propriedade, latitude, longitude")
        .order("nome_propriedade")
        .order("id")
        .range(de, ate),
    );
  },
  ["propriedades-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["propriedades"] },
);

// Agregados de 0020_gestor_dados_reais.sql (uma linha por fazenda/dia, ou por fazenda).
export const getResumoFazendasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase.from("resumo_fazendas").select("*").order("propriedade_id").range(de, ate),
    );
  },
  ["resumo-fazendas-cache"],
  {
    revalidate: REVALIDATE_SEGUNDOS,
    tags: ["propriedades", "vacas", "bezerros", "leite", "financeiro", "partos"],
  },
);

export const getLeiteDiarioTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("leite_diario_propriedade")
        .select("*")
        .order("propriedade_id")
        .order("data")
        .range(de, ate),
    );
  },
  ["leite-diario-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["leite"] },
);

export const getFinanceiroDiarioTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("financeiro_diario_propriedade")
        .select("*")
        .order("propriedade_id")
        .order("data")
        .range(de, ate),
    );
  },
  ["financeiro-diario-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["financeiro"] },
);

export const getIndicadoresTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase.rpc("indicadores_todas_fazendas").order("propriedade_id").range(de, ate),
    );
  },
  ["indicadores-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["vacas", "bezerros", "leite", "financeiro"] },
);

// Log de mensagens do bot (o site só lê). Janela de dias pra não puxar o histórico inteiro.
export const getInteracoesRecentesCache = unstable_cache(
  async (desde: string) => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("interacoes_log")
        .select("id, propriedade_id, intencao_detectada, mensagem_recebida, created_at")
        .gte("created_at", desde)
        .order("created_at", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["interacoes-recentes-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["interacoes"] },
);

export const getEntregasDosesTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("entregas_doses")
        .select("*, touro:touro_id(id, nome, codigo), propriedade:propriedade_id(id, nome_propriedade)")
        .order("data_entrega", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["entregas-doses-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["entregas_doses"] },
);

export const getSaldoDosesTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("saldo_doses")
        .select("*")
        .order("propriedade_id")
        .order("touro_id")
        .range(de, ate),
    );
  },
  ["saldo-doses-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["entregas_doses", "coberturas", "baixas_doses"] },
);

export const getAdesoesTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("adesoes_programa")
        .select("*")
        .order("data_adesao")
        .order("propriedade_id")
        .range(de, ate),
    );
  },
  ["adesoes-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["adesoes"] },
);

// Valor de hoje de cada fazenda que aderiu — depende de rebanho, leite e financeiro.
export const getIndicadoresAtuaisCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase.rpc("indicadores_atuais_programa").order("propriedade_id").range(de, ate),
    );
  },
  ["indicadores-atuais-cache"],
  {
    revalidate: REVALIDATE_SEGUNDOS,
    tags: ["adesoes", "vacas", "bezerros", "leite", "financeiro"],
  },
);

export const getBaixasDosesTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("baixas_doses")
        .select("*, touro:touro_id(id, nome, codigo), propriedade:propriedade_id(id, nome_propriedade)")
        .order("data_baixa", { ascending: false })
        .order("id")
        .range(de, ate),
    );
  },
  ["baixas-doses-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["baixas_doses"] },
);

// Resultados reprodutivos das doses do programa, por fazenda.
export const getIndicadoresReprodutivosTodasCache = unstable_cache(
  async () => {
    const supabase = createServiceClient();
    return buscarTodasPaginas((de, ate) =>
      supabase
        .from("indicadores_reprodutivos_programa")
        .select("*")
        .order("propriedade_id")
        .range(de, ate),
    );
  },
  ["indicadores-reprodutivos-todas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["coberturas", "partos", "bezerros"] },
);
