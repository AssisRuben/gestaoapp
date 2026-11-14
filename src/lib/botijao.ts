import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { CamposAutoria } from "@/app/(app)/autoria";

export const BUCKET_BOTIJAO = "botijao";

export type AbastecimentoBotijao = CamposAutoria & {
  id: string;
  data: string;
  nivel_cm: number;
  valor: number;
  // URL assinada (1h) da foto; nula se o arquivo não for encontrado
  foto_url: string | null;
};

// Abastecimentos do botijão da fazenda, do mais recente pro mais antigo. Usa service role (a foto
// fica num bucket privado): quem chama já validou o acesso à fazenda via getPropriedadeAtual().
export async function carregarAbastecimentosBotijao(propriedadeId: string): Promise<AbastecimentoBotijao[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("botijao_abastecimentos")
    .select("id, data, nivel_cm, valor, foto_path, created_at, criado_por, criado_via, atualizado_por, atualizado_em")
    .eq("propriedade_id", propriedadeId)
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
    foto_url: urls.get(l.foto_path as string) ?? null,
    created_at: l.created_at as string,
    criado_por: l.criado_por as string | null,
    criado_via: l.criado_via as string | null,
    atualizado_por: l.atualizado_por as string | null,
    atualizado_em: l.atualizado_em as string | null,
  }));
}
