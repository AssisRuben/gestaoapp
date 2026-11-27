import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { CamposAutoria } from "@/app/(app)/autoria";

export const BUCKET_BOTIJAO = "botijao";

export type AbastecimentoBotijao = CamposAutoria & {
  id: string;
  data: string;
  nivel_cm: number;
  valor: number;
  // kit de inseminação do abastecimento (0074); nulo = botijão da fazenda
  kit_id: string | null;
  // URL assinada (1h) da foto; nula se o arquivo não for encontrado
  foto_url: string | null;
};

// Abastecimentos do botijão da fazenda, do mais recente pro mais antigo. Usa service role (a foto
// fica num bucket privado): quem chama já validou o acesso à fazenda via getPropriedadeAtual().
export async function carregarAbastecimentosBotijao(propriedadeId: string): Promise<AbastecimentoBotijao[]> {
  return carregarAbastecimentos({ propriedadeId });
}

// Kit de inseminação com quem recebeu (0074): kits da fazenda aberta + do técnico logado. Pela
// sessão do usuário — kits_comigo só devolve o que é dele.
export type KitComigo = {
  id: string;
  patrimonio: string;
  processo: string | null;
  entidade_nome: string;
  entidade_responsavel: string | null;
  entidade_telefone: string | null;
  com_tecnico: boolean;
  cedido_em: string;
  recebido_em: string | null;
  recebido_por_nome: string | null;
  doses: { touro: string; quantidade: number; recebido: boolean }[];
  ultimo_abastecimento: string | null;
  dias_sem_abastecer: number;
  abastecimentos: AbastecimentoBotijao[];
};

export async function carregarKitsComigo(propriedadeId: string): Promise<KitComigo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kits_comigo", { p_propriedade_id: propriedadeId });
  // sem a migration 0074, a tela segue sem o bloco
  if (error || !data?.length) return [];
  const kits = data as Omit<KitComigo, "abastecimentos">[];
  const abastecimentos = await carregarAbastecimentos({ kitIds: kits.map((k) => k.id) });
  return kits.map((k) => ({
    ...k,
    dias_sem_abastecer: Number(k.dias_sem_abastecer),
    doses: (k.doses ?? []).map((d) => ({ ...d, quantidade: Number(d.quantidade) })),
    // do kit e desde a cessão atual (o histórico de quem teve o kit antes não é dele)
    abastecimentos: abastecimentos.filter((a) => a.kit_id === k.id && a.data >= k.cedido_em),
  }));
}

// Kit em que a sessão pode registrar abastecimento (confere antes de enviar a foto)
export async function kitEstaComigo(propriedadeId: string | null, kitId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("kits_comigo", { p_propriedade_id: propriedadeId });
  return ((data ?? []) as { id: string }[]).some((k) => k.id === kitId);
}

async function carregarAbastecimentos(filtro: { propriedadeId?: string; kitIds?: string[] }): Promise<AbastecimentoBotijao[]> {
  const supabase = createServiceClient();
  let consulta = supabase
    .from("botijao_abastecimentos")
    .select("id, data, nivel_cm, valor, foto_path, kit_id, created_at, criado_por, criado_via, atualizado_por, atualizado_em");
  if (filtro.propriedadeId) consulta = consulta.eq("propriedade_id", filtro.propriedadeId);
  if (filtro.kitIds) consulta = consulta.in("kit_id", filtro.kitIds);
  const { data, error } = await consulta
    .order("data", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id")
    .limit(200);
  if (error) throw new Error(error.message);

  const linhas = data ?? [];
  const caminhos = linhas.map((l) => l.foto_path as string);
  const urls = new Map<string, string>();
  if (caminhos.length > 0) {
    const { data: assinadas } = await supabase.storage.from(BUCKET_BOTIJAO).createSignedUrls(caminhos, 3600);
    for (const a of assinadas ?? []) {
      if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
    }
  }

  return linhas.map((l) => ({
    id: l.id as string,
    data: l.data as string,
    nivel_cm: Number(l.nivel_cm),
    valor: Number(l.valor),
    kit_id: (l.kit_id as string | null) ?? null,
    foto_url: urls.get(l.foto_path as string) ?? null,
    created_at: l.created_at as string,
    criado_por: l.criado_por as string | null,
    criado_via: l.criado_via as string | null,
    atualizado_por: l.atualizado_por as string | null,
    atualizado_em: l.atualizado_em as string | null,
  }));
}
