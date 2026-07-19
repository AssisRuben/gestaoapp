"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ConfirmarSecagemState = { error?: string; success?: boolean } | undefined;

export async function confirmarSecagem(
  _state: ConfirmarSecagemState,
  formData: FormData,
): Promise<ConfirmarSecagemState> {
  const vacaId = formData.get("vaca_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("secar_vaca", { p_vaca_id: vacaId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  updateTag("vacas");
  return { success: true };
}

export type ConfirmarDiagnosticoState = { error?: string; success?: boolean } | undefined;

export async function confirmarDiagnostico(
  _state: ConfirmarDiagnosticoState,
  formData: FormData,
): Promise<ConfirmarDiagnosticoState> {
  const coberturaId = formData.get("cobertura_id") as string;
  const diagnostico = formData.get("diagnostico_prenhez") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_diagnostico", {
    p_cobertura_id: coberturaId,
    p_diagnostico_prenhez: diagnostico,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  updateTag("coberturas");
  return { success: true };
}
