"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor } from "@/lib/propriedade";

// Quem garante a permissão é a própria RPC (0023_acesso_tecnicos.sql); o isGestor() aqui é só pra
// devolver uma mensagem clara.

export type TecnicoActionState = { error?: string; success?: boolean } | undefined;

const SEM_ACESSO = "Só o gestor do programa pode fazer isso.";

export async function vincularTecnicoGestor(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: SEM_ACESSO };

  const propriedadeId = String(formData.get("propriedade_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!propriedadeId) return { error: "Escolha a fazenda." };
  if (!email) return { error: "Informe o e-mail do técnico." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("vincular_tecnico", {
    p_propriedade_id: propriedadeId,
    p_email: email,
  });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}

export async function desvincularTecnicoGestor(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: SEM_ACESSO };

  const supabase = await createClient();
  const { error } = await supabase.rpc("desvincular_tecnico", {
    p_propriedade_id: formData.get("propriedade_id") as string,
    p_usuario_id: formData.get("usuario_id") as string,
  });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}
