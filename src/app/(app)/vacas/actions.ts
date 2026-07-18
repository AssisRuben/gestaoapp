"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";

export type CadastrarVacaState = { error?: string; success?: boolean } | undefined;

export async function cadastrarVaca(
  _state: CadastrarVacaState,
  formData: FormData,
): Promise<CadastrarVacaState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) {
    return { error: "Nenhuma propriedade vinculada à sua conta." };
  }

  const numeroRaw = formData.get("numero_identificacao") as string;
  const maeIdRaw = formData.get("mae_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("cadastrar_vaca", {
    p_propriedade_id: propriedadeAtual.id,
    p_numero_identificacao: numeroRaw ? Number(numeroRaw) : null,
    p_mae_id: maeIdRaw || null,
    p_status_produtivo: formData.get("status_produtivo") as string,
    p_status_reprodutivo: formData.get("status_reprodutivo") as string,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vacas");
  return { success: true };
}

export type DeletarVacaState = { error?: string; success?: boolean } | undefined;

export async function deletarVaca(
  _state: DeletarVacaState,
  formData: FormData,
): Promise<DeletarVacaState> {
  const vacaId = formData.get("vaca_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_vaca", { p_vaca_id: vacaId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vacas");
  return { success: true };
}

export type AtualizarVacaState = { error?: string; success?: boolean } | undefined;

export async function atualizarVaca(
  _state: AtualizarVacaState,
  formData: FormData,
): Promise<AtualizarVacaState> {
  const vacaId = formData.get("vaca_id") as string;
  const maeIdRaw = formData.get("mae_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_vaca", {
    p_vaca_id: vacaId,
    p_numero_identificacao: Number(formData.get("numero_identificacao")),
    p_mae_id: maeIdRaw || null,
    p_status_produtivo: formData.get("status_produtivo") as string,
    p_status_reprodutivo: formData.get("status_reprodutivo") as string,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vacas");
  return { success: true };
}
