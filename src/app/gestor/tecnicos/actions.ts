"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor, semAcessoGestor } from "@/lib/propriedade";

// Quem garante a permissão é a própria RPC (0023_acesso_tecnicos.sql); o isGestor() aqui é só pra
// devolver uma mensagem clara.

export type TecnicoActionState = { error?: string; success?: boolean } | undefined;

export async function vincularTecnicoGestor(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const propriedadeId = String(formData.get("propriedade_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!propriedadeId) return { error: "Escolha a fazenda." };
  if (!email) return { error: "Informe o e-mail do técnico." };

  // papel "produtor": conta de quem já usa o bot, ligada à fazenda que já existe (0044)
  const produtor = formData.get("papel") === "produtor";
  const supabase = await createClient();
  const { error } = await supabase.rpc(produtor ? "vincular_produtor" : "vincular_tecnico", {
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
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const produtor = formData.get("papel") === "produtor";
  const supabase = await createClient();
  const { error } = await supabase.rpc(produtor ? "desvincular_produtor" : "desvincular_tecnico", {
    p_propriedade_id: formData.get("propriedade_id") as string,
    p_usuario_id: formData.get("usuario_id") as string,
  });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}

// Fazenda nova cadastrada pelo gestor (0044): o produtor já usa o bot pelo WhatsApp informado.
export async function criarFazendaGestor(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const texto = (campo: string) => String(formData.get(campo) ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("gestor_criar_fazenda", {
    p_nome_propriedade: texto("nome_propriedade") ?? "",
    p_nome_produtor: texto("nome_produtor") ?? "",
    p_municipio: texto("municipio"),
    p_estado: texto("estado"),
    p_tecnico_responsavel: texto("tecnico_responsavel"),
    p_whatsapp: texto("whatsapp"),
  });
  if (error) return { error: error.message };

  updateTag("propriedades");
  revalidatePath("/gestor", "layout");
  return { success: true };
}

export async function adicionarGestor(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe o e-mail da conta." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_gestor", { p_email: email });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}

export async function removerGestor(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_gestor", { p_usuario_id: formData.get("usuario_id") as string });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}
