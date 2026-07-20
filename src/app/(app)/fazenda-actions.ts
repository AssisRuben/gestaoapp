"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";
import type { UsuarioWhatsapp, PatrimonioItem } from "./fazenda-types";

type ActionState = { error?: string; success?: boolean } | undefined;

export async function getFazendaData(): Promise<{
  usuarioWhatsapp: UsuarioWhatsapp | null;
  patrimonios: PatrimonioItem[];
}> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return { usuarioWhatsapp: null, patrimonios: [] };

  const supabase = await createClient();
  const [{ data: whatsappData }, { data: patrimonioData }] = await Promise.all([
    supabase
      .from("usuarios_whatsapp")
      .select("id, propriedade_id, telefone, papel, ativo, created_at")
      .eq("propriedade_id", propriedadeAtual.id)
      .order("created_at"),
    supabase
      .from("patrimonio")
      .select("id, propriedade_id, tipo_ativo, valor_total, taxa_juros, vida_util, created_at")
      .eq("propriedade_id", propriedadeAtual.id)
      .order("created_at"),
  ]);

  return {
    usuarioWhatsapp: whatsappData?.[0] ?? null,
    patrimonios: patrimonioData ?? [],
  };
}

export async function atualizarPropriedade(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) {
    return { error: "Nenhuma propriedade vinculada à sua conta." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("propriedades")
    .update({
      nome_propriedade: formData.get("nome_propriedade") as string,
      nome_produtor: formData.get("nome_produtor") as string,
      municipio: (formData.get("municipio") as string) || null,
      estado: (formData.get("estado") as string) || null,
      tecnico_responsavel: (formData.get("tecnico_responsavel") as string) || null,
      latitude: formData.get("latitude") ? Number(formData.get("latitude")) : null,
      longitude: formData.get("longitude") ? Number(formData.get("longitude")) : null,
    })
    .eq("id", propriedadeAtual.id);

  if (error) {
    return { error: error.message };
  }

  const whatsappId = formData.get("whatsapp_id") as string;
  const whatsappTelefone = ((formData.get("whatsapp_telefone") as string) || "").trim();

  if (whatsappTelefone) {
    const { error: whatsappError } = whatsappId
      ? await supabase.from("usuarios_whatsapp").update({ telefone: whatsappTelefone }).eq("id", whatsappId)
      : await supabase
          .from("usuarios_whatsapp")
          .insert({ propriedade_id: propriedadeAtual.id, telefone: whatsappTelefone });

    if (whatsappError) {
      return { error: whatsappError.message };
    }
  }

  revalidatePath("/");
  updateTag("propriedades");
  return { success: true };
}

export async function cadastrarPatrimonio(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) {
    return { error: "Nenhuma propriedade vinculada à sua conta." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("patrimonio").insert({
    propriedade_id: propriedadeAtual.id,
    tipo_ativo: (formData.get("tipo_ativo") as string) || null,
    valor_total: formData.get("valor_total") ? Number(formData.get("valor_total")) : null,
    taxa_juros: formData.get("taxa_juros") ? Number(formData.get("taxa_juros")) : null,
    vida_util: formData.get("vida_util") ? Number(formData.get("vida_util")) : null,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

export async function atualizarPatrimonio(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase
    .from("patrimonio")
    .update({
      tipo_ativo: (formData.get("tipo_ativo") as string) || null,
      valor_total: formData.get("valor_total") ? Number(formData.get("valor_total")) : null,
      taxa_juros: formData.get("taxa_juros") ? Number(formData.get("taxa_juros")) : null,
      vida_util: formData.get("vida_util") ? Number(formData.get("vida_util")) : null,
    })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}

export async function deletarPatrimonio(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = formData.get("id") as string;

  const supabase = await createClient();
  const { error } = await supabase.from("patrimonio").delete().eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/");
  return { success: true };
}
