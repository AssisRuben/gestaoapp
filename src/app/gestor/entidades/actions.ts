"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor, semAcessoGestor } from "@/lib/propriedade";

export type EntidadeState = { error?: string; success?: boolean } | undefined;

// Cadastro/edição de entidade pela aba Entidades (0050). CNPJ conferido no banco.
export async function salvarEntidade(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const texto = (campo: string) => String(formData.get(campo) ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("gestor_editar_entidade", {
    p_id: texto("entidade_id"),
    p_nome: texto("nome") ?? "",
    p_cnpj: texto("cnpj"),
    p_responsavel: texto("responsavel"),
    p_telefone: texto("telefone"),
  });
  if (error) return { error: error.message };

  updateTag("entregas_doses"); // as entregas mostram nome/responsável da entidade
  revalidatePath("/gestor/entidades");
  revalidatePath("/gestor/programa");
  return { success: true };
}
