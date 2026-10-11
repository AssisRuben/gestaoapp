"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";

export type RegistrarLeiteState = { error?: string; success?: boolean } | undefined;

export async function registrarLeite(
  _state: RegistrarLeiteState,
  formData: FormData,
): Promise<RegistrarLeiteState> {
  const vacaId = formData.get("vaca_id") as string;
  const litros = formData.get("litros") as string;
  const dataControle = formData.get("data_controle") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_leite", {
    p_vaca_id: vacaId,
    p_litros: Number(litros),
    p_data_controle: dataControle,
    p_periodo: (formData.get("periodo") as string) || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/leite");
  updateTag("leite");
  return { success: true };
}

export type AtualizarLeiteState = { error?: string; success?: boolean } | undefined;

export async function atualizarLeite(
  _state: AtualizarLeiteState,
  formData: FormData,
): Promise<AtualizarLeiteState> {
  const registroId = formData.get("registro_id") as string;
  const litros = formData.get("litros") as string;
  const dataControle = formData.get("data_controle") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_leite", {
    p_registro_id: registroId,
    p_litros: Number(litros),
    p_data_controle: dataControle,
    p_periodo: (formData.get("periodo") as string) || null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/leite");
  updateTag("leite");
  return { success: true };
}

export type ResultadoPesagem = {
  error?: string;
  salvos?: number;
  corrigidos?: number;
  erros?: { vaca_id: string; numero: number | null; mensagem: string }[];
};

export async function salvarPesagem(
  dataControle: string,
  periodo: string,
  itens: { vaca_id: string; litros: number }[],
): Promise<ResultadoPesagem> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return { error: "Nenhuma propriedade vinculada à sua conta." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("registrar_pesagem", {
    p_propriedade_id: propriedadeAtual.id,
    p_data_controle: dataControle,
    p_periodo: periodo,
    p_itens: itens,
  });

  if (error) return { error: error.message };

  revalidatePath("/leite");
  updateTag("leite");
  return data as ResultadoPesagem;
}

export type DeletarLeiteState = { error?: string; success?: boolean } | undefined;

export async function deletarLeite(
  _state: DeletarLeiteState,
  formData: FormData,
): Promise<DeletarLeiteState> {
  const registroId = formData.get("registro_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_leite", { p_registro_id: registroId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/leite");
  updateTag("leite");
  return { success: true };
}
