"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";

const DIACRITICOS = /[̀-ͯ]/g;

function normalizarCategoria(categoria: string): string {
  const limpa = categoria.trim().toLowerCase().normalize("NFD").replace(DIACRITICOS, "");
  return limpa || "outros";
}

export type RegistrarLancamentoState = { error?: string; success?: boolean } | undefined;

export async function registrarLancamento(
  _state: RegistrarLancamentoState,
  formData: FormData,
): Promise<RegistrarLancamentoState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) {
    return { error: "Nenhuma propriedade vinculada à sua conta." };
  }

  const valor = Number(formData.get("valor"));
  if (!valor || valor <= 0) {
    return { error: "Informe um valor maior que zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("financeiro").insert({
    propriedade_id: propriedadeAtual.id,
    tipo: formData.get("tipo") as string,
    categoria: normalizarCategoria((formData.get("categoria") as string) ?? ""),
    valor,
    data: formData.get("data") as string,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/financeiro");
  updateTag("financeiro");
  return { success: true };
}

export type AtualizarLancamentoState = { error?: string; success?: boolean } | undefined;

export async function atualizarLancamento(
  _state: AtualizarLancamentoState,
  formData: FormData,
): Promise<AtualizarLancamentoState> {
  const id = formData.get("id") as string;

  const valor = Number(formData.get("valor"));
  if (!valor || valor <= 0) {
    return { error: "Informe um valor maior que zero." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("financeiro")
    .update({
      tipo: formData.get("tipo") as string,
      categoria: normalizarCategoria((formData.get("categoria") as string) ?? ""),
      valor,
      data: formData.get("data") as string,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/financeiro");
  updateTag("financeiro");
  return { success: true };
}

export type DeletarLancamentoState = { error?: string; success?: boolean } | undefined;

export async function deletarLancamento(
  _state: DeletarLancamentoState,
  formData: FormData,
): Promise<DeletarLancamentoState> {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.from("financeiro").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/financeiro");
  updateTag("financeiro");
  return { success: true };
}
