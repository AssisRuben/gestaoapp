"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";

export type RegistrarCoberturaState = { error?: string; success?: boolean } | undefined;

export async function registrarCobertura(
  _state: RegistrarCoberturaState,
  formData: FormData,
): Promise<RegistrarCoberturaState> {
  const vacaId = formData.get("vaca_id") as string;
  const dataCobertura = formData.get("data_cobertura") as string;
  const touroSemenRaw = formData.get("touro_semen") as string;
  const touroIdRaw = formData.get("touro_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_cobertura", {
    p_vaca_id: vacaId,
    p_data_cobertura: dataCobertura,
    p_touro_semen: touroSemenRaw || null,
    p_touro_id: touroIdRaw || null,
    p_dose_programa: formData.get("dose_programa") === "on",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  updateTag("coberturas");
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
  revalidatePath("/leite");
  updateTag("partos");
  updateTag("bezerros");
  updateTag("vacas");
  updateTag("coberturas");
  // registrar_parto arquiva (remove) o leite da lactação que acabou de fechar
  updateTag("leite");
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
  updateTag("partos");
  updateTag("bezerros");
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
  updateTag("partos");
  updateTag("bezerros");
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
  const touroIdRaw = formData.get("touro_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_cobertura", {
    p_cobertura_id: coberturaId,
    p_data_cobertura: dataCobertura,
    p_touro_semen: touroSemenRaw || null,
    p_diagnostico_prenhez: diagnostico,
    p_touro_id: touroIdRaw || null,
    p_dose_programa: formData.get("dose_programa") === "on",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  updateTag("coberturas");
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
  updateTag("coberturas");
  return { success: true };
}

export type ConfirmarRecebimentoState = { error?: string; success?: boolean } | undefined;

export async function confirmarRecebimentoDoses(
  _state: ConfirmarRecebimentoState,
  formData: FormData,
): Promise<ConfirmarRecebimentoState> {
  const entregaId = formData.get("entrega_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_recebimento_doses", {
    p_entrega_id: entregaId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  revalidatePath("/gestor/programa");
  updateTag("entregas_doses");
  return { success: true };
}

export type BaixaDosesState = { error?: string; success?: boolean } | undefined;

function revalidarDoses() {
  revalidatePath("/reproducao");
  revalidatePath("/gestor/programa");
  updateTag("baixas_doses");
}

export async function registrarBaixaDoses(
  _state: BaixaDosesState,
  formData: FormData,
): Promise<BaixaDosesState> {
  const propriedade = await getPropriedadeAtual();
  if (!propriedade) return { error: "Conta sem propriedade vinculada." };

  const quantidade = Number(formData.get("quantidade"));
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: "A quantidade deve ser um número inteiro maior que zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_baixa_doses", {
    p_propriedade_id: propriedade.id,
    p_touro_id: formData.get("touro_id") as string,
    p_quantidade: quantidade,
    p_motivo: formData.get("motivo") as string,
    p_data_baixa: formData.get("data_baixa") as string,
    p_observacao: (formData.get("observacao") as string) || null,
  });

  if (error) return { error: error.message };

  revalidarDoses();
  return { success: true };
}

export async function deletarBaixaDoses(
  _state: BaixaDosesState,
  formData: FormData,
): Promise<BaixaDosesState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_baixa_doses", {
    p_baixa_id: formData.get("baixa_id") as string,
  });

  if (error) return { error: error.message };

  revalidarDoses();
  return { success: true };
}
