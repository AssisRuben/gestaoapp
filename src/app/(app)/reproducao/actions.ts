"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type RegistrarCoberturaState = { error?: string; success?: boolean } | undefined;

export async function registrarCobertura(
  _state: RegistrarCoberturaState,
  formData: FormData,
): Promise<RegistrarCoberturaState> {
  const vacaId = formData.get("vaca_id") as string;
  const dataCobertura = formData.get("data_cobertura") as string;
  const touroSemenRaw = formData.get("touro_semen") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_cobertura", {
    p_vaca_id: vacaId,
    p_data_cobertura: dataCobertura,
    p_touro_semen: touroSemenRaw || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  return { success: true };
}

export type RegistrarPartoState = { error?: string; success?: boolean } | undefined;

export async function registrarParto(
  _state: RegistrarPartoState,
  formData: FormData,
): Promise<RegistrarPartoState> {
  const vacaId = formData.get("vaca_id") as string;
  const dataParto = formData.get("data_parto") as string;
  const numeroBezerroRaw = formData.get("numero_bezerro") as string;
  const sexoBezerroRaw = formData.get("sexo_bezerro") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_parto", {
    p_vaca_id: vacaId,
    p_data_parto: dataParto,
    p_numero_bezerro: numeroBezerroRaw ? Number(numeroBezerroRaw) : null,
    p_sexo_bezerro: sexoBezerroRaw || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  revalidatePath("/bezerros");
  revalidatePath("/vacas");
  return { success: true };
}

export type AtualizarPartoState = { error?: string; success?: boolean } | undefined;

export async function atualizarParto(
  _state: AtualizarPartoState,
  formData: FormData,
): Promise<AtualizarPartoState> {
  const partoId = formData.get("parto_id") as string;
  const dataParto = formData.get("data_parto") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_parto", {
    p_parto_id: partoId,
    p_data_parto: dataParto,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  revalidatePath("/bezerros");
  return { success: true };
}

export type DeletarPartoState = { error?: string; success?: boolean } | undefined;

export async function deletarParto(
  _state: DeletarPartoState,
  formData: FormData,
): Promise<DeletarPartoState> {
  const partoId = formData.get("parto_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_parto", { p_parto_id: partoId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  revalidatePath("/bezerros");
  return { success: true };
}

export type AtualizarCoberturaState = { error?: string; success?: boolean } | undefined;

export async function atualizarCobertura(
  _state: AtualizarCoberturaState,
  formData: FormData,
): Promise<AtualizarCoberturaState> {
  const coberturaId = formData.get("cobertura_id") as string;
  const dataCobertura = formData.get("data_cobertura") as string;
  const touroSemenRaw = formData.get("touro_semen") as string;
  const diagnostico = formData.get("diagnostico_prenhez") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_cobertura", {
    p_cobertura_id: coberturaId,
    p_data_cobertura: dataCobertura,
    p_touro_semen: touroSemenRaw || null,
    p_diagnostico_prenhez: diagnostico,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  return { success: true };
}

export type DeletarCoberturaState = { error?: string; success?: boolean } | undefined;

export async function deletarCobertura(
  _state: DeletarCoberturaState,
  formData: FormData,
): Promise<DeletarCoberturaState> {
  const coberturaId = formData.get("cobertura_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_cobertura", { p_cobertura_id: coberturaId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  return { success: true };
}
