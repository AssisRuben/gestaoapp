"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LinhaFazenda } from "@/lib/planilha-fazendas";

// Técnico autorizado pelo gestor cadastra fazendas de acompanhamento (0056): sem WhatsApp, sem
// acesso do produtor, já ligadas ao técnico. Quem garante a permissão é a RPC.

export type FazendaActionState = { error?: string; success?: string } | undefined;

function atualizarTelas() {
  updateTag("propriedades");
  revalidatePath("/", "layout");
}

export async function criarFazendaTecnico(
  _state: FazendaActionState,
  formData: FormData,
): Promise<FazendaActionState> {
  const texto = (campo: string) => String(formData.get(campo) ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("tecnico_criar_fazenda", {
    p_nome_propriedade: texto("nome_propriedade") ?? "",
    p_nome_produtor: texto("nome_produtor") ?? "",
    p_municipio: texto("municipio"),
    p_estado: texto("estado"),
    p_tecnico_responsavel: texto("tecnico_responsavel"),
  });
  if (error) return { error: error.message };

  atualizarTelas();
  return { success: `Fazenda "${texto("nome_propriedade")}" cadastrada. Ela já aparece no seletor de fazendas.` };
}

export type ResultadoLote = {
  gravado: boolean;
  ok: number;
  erros: number;
  linhas: { linha: number; ok: boolean; erro?: string }[];
};

export async function criarFazendasLote(
  linhas: LinhaFazenda[],
  gravar: boolean,
): Promise<{ resultado?: ResultadoLote; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("tecnico_criar_fazendas", { p_linhas: linhas, p_gravar: gravar });
  if (error) return { error: error.message };

  const resultado = data as ResultadoLote;
  if (resultado.gravado && resultado.ok > 0) atualizarTelas();
  return { resultado };
}
