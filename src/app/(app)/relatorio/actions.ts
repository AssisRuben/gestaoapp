"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";

export type VisitaState = { error?: string; success?: boolean } | undefined;

export async function registrarVisita(_state: VisitaState, formData: FormData): Promise<VisitaState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return { error: "Nenhuma propriedade vinculada à sua conta." };

  const recomendacoes = String(formData.get("recomendacoes") ?? "")
    .split("\n")
    .map((l) => l.replace(/^[\s•\-*○]+/, "").trim())
    .filter(Boolean);

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_visita", {
    p_propriedade_id: propriedadeAtual.id,
    p_data_visita: formData.get("data_visita") as string,
    p_observacoes: (formData.get("observacoes") as string) || null,
    p_recomendacoes: recomendacoes,
    p_prazo: (formData.get("prazo") as string) || null,
  });
  if (error) return { error: error.message };

  revalidatePath("/relatorio");
  return { success: true };
}

export async function concluirRecomendacao(id: string, concluida: boolean): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("concluir_recomendacao", { p_recomendacao_id: id, p_concluida: concluida });
  if (error) return { error: error.message };
  revalidatePath("/relatorio");
  return {};
}

export async function excluirVisita(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("excluir_visita", { p_visita_id: id });
  if (error) return { error: error.message };
  revalidatePath("/relatorio");
  return {};
}
