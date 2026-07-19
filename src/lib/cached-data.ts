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

export const getVacasCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("vacas")
      .select("*, mae:mae_id(id, numero_identificacao)")
      .eq("propriedade_id", propriedadeId)
      .order("numero_identificacao");
    return data ?? [];
  },
  ["vacas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["vacas"] },
);

export const getBezerrosCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("bezerros")
      .select(
        "*, mae:mae_id(id, numero_identificacao), vaca_gerada:vaca_id_gerada(id, numero_identificacao)",
      )
      .eq("propriedade_id", propriedadeId)
      .order("numero_identificacao");
    return data ?? [];
  },
  ["bezerros-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["bezerros"] },
);

export const getControleLeiteCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("controle_leite")
      .select("*, vaca:vaca_id!inner(id, numero_identificacao, propriedade_id)")
      .eq("vaca.propriedade_id", propriedadeId)
      .order("numero_identificacao", { foreignTable: "vaca" })
      .order("data_controle", { ascending: false });
    return data ?? [];
  },
  ["controle-leite-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["leite"] },
);

export const getFinanceiroCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("financeiro")
      .select("*")
      .eq("propriedade_id", propriedadeId)
      .order("data", { ascending: false });
    return data ?? [];
  },
  ["financeiro-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["financeiro"] },
);

export const getCoberturasCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("coberturas")
      .select("*, vaca:vaca_id!inner(id, numero_identificacao, propriedade_id)")
      .eq("vaca.propriedade_id", propriedadeId)
      .order("numero_identificacao", { foreignTable: "vaca" })
      .order("data_cobertura", { ascending: false });
    return data ?? [];
  },
  ["coberturas-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["coberturas"] },
);

export const getPartosCache = unstable_cache(
  async (propriedadeId: string) => {
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("partos")
      .select("*, vaca:vaca_id!inner(id, numero_identificacao, propriedade_id)")
      .eq("vaca.propriedade_id", propriedadeId)
      .order("numero_identificacao", { foreignTable: "vaca" })
      .order("data_parto", { ascending: false });
    return data ?? [];
  },
  ["partos-cache"],
  { revalidate: REVALIDATE_SEGUNDOS, tags: ["partos"] },
);
