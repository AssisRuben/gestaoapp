"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";

export type CadastrarBezerroState = { error?: string; success?: boolean } | undefined;

export async function cadastrarBezerro(
  _state: CadastrarBezerroState,
  formData: FormData,
): Promise<CadastrarBezerroState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) {
    return { error: "Nenhuma propriedade vinculada à sua conta." };
  }

  const numeroRaw = formData.get("numero_identificacao") as string;
  const maeIdRaw = formData.get("mae_id") as string;
  const sexoRaw = formData.get("sexo") as string;
  const dataNascimentoRaw = formData.get("data_nascimento") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("cadastrar_bezerro", {
    p_propriedade_id: propriedadeAtual.id,
    p_numero_identificacao: numeroRaw ? Number(numeroRaw) : null,
    p_mae_id: maeIdRaw || null,
    p_sexo: sexoRaw || null,
    p_data_nascimento: dataNascimentoRaw || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/bezerros");
  updateTag("bezerros");
  return { success: true };
}

export type PromoverBezerroState = { error?: string; success?: boolean; vacaId?: string } | undefined;

export async function promoverBezerro(
  _state: PromoverBezerroState,
  formData: FormData,
): Promise<PromoverBezerroState> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("promover_bezerro", {
    p_bezerro_id: formData.get("bezerro_id") as string,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/bezerros");
  revalidatePath("/vacas");
  updateTag("bezerros");
  updateTag("vacas");
  return { success: true, vacaId: (data as { id: string }).id };
}

export type DeletarBezerroState = { error?: string; success?: boolean } | undefined;

export async function deletarBezerro(
  _state: DeletarBezerroState,
  formData: FormData,
): Promise<DeletarBezerroState> {
  const bezerroId = formData.get("bezerro_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_bezerro", { p_bezerro_id: bezerroId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/bezerros");
  updateTag("bezerros");
  return { success: true };
}

export type AtualizarBezerroState = { error?: string; success?: boolean } | undefined;

export async function atualizarBezerro(
  _state: AtualizarBezerroState,
  formData: FormData,
): Promise<AtualizarBezerroState> {
  const bezerroId = formData.get("bezerro_id") as string;
  const maeIdRaw = formData.get("mae_id") as string;
  const sexoRaw = formData.get("sexo") as string;
  const dataNascimentoRaw = formData.get("data_nascimento") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_bezerro", {
    p_bezerro_id: bezerroId,
    p_numero_identificacao: Number(formData.get("numero_identificacao")),
    p_mae_id: maeIdRaw || null,
    p_sexo: sexoRaw || null,
    p_data_nascimento: dataNascimentoRaw || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/bezerros");
  updateTag("bezerros");
  return { success: true };
}
