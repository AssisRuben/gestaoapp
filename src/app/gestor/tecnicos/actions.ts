"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor, semAcessoGestor } from "@/lib/propriedade";
import { liberarProdutorPorEmail, mensagemLiberarProdutor } from "@/lib/liberar-produtor";

// Quem garante a permissão é a própria RPC (0023_acesso_tecnicos.sql); o isGestor() aqui é só pra
// devolver uma mensagem clara.

export type TecnicoActionState = { error?: string; success?: boolean; mensagem?: string } | undefined;

export async function vincularTecnicoGestor(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const propriedadeId = String(formData.get("propriedade_id") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  if (!propriedadeId) return { error: "Escolha a fazenda." };
  if (!email) return { error: "Informe o e-mail do técnico." };

  const supabase = await createClient();

  // papel "produtor": liga à fazenda que já existe; sem conta, cria e manda o e-mail de senha (0063)
  if (formData.get("papel") === "produtor") {
    const { data: faz } = await supabase.from("propriedades").select("nome_produtor").eq("id", propriedadeId).maybeSingle();
    const r = await liberarProdutorPorEmail(supabase, propriedadeId, email, faz?.nome_produtor ?? null);
    if (r.error) return { error: r.error };
    revalidatePath("/gestor/tecnicos");
    return { success: true, mensagem: mensagemLiberarProdutor(email, r) };
  }

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

// Limite diário de interações com o bot, por fazenda (0059). Campo vazio = volta ao padrão.
export async function definirLimiteBot(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const propriedadeId = String(formData.get("propriedade_id") ?? "");
  if (!propriedadeId) return { error: "Escolha a fazenda." };
  const texto = String(formData.get("limite") ?? "").trim();
  const limite = texto === "" ? null : Number(texto);
  if (limite !== null && (!Number.isInteger(limite) || limite < 1 || limite > 1000)) {
    return { error: "O limite deve ser um número inteiro entre 1 e 1000 (ou vazio pra usar o padrão)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("gestor_definir_limite_bot", {
    p_propriedade_id: propriedadeId,
    p_limite: limite,
  });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}

// Técnicos autorizados a cadastrar fazendas de acompanhamento (0056).
export async function adicionarCadastrador(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Informe o e-mail da conta." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("adicionar_tecnico_cadastrador", { p_email: email });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}

export async function removerCadastrador(
  _state: TecnicoActionState,
  formData: FormData,
): Promise<TecnicoActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remover_tecnico_cadastrador", {
    p_usuario_id: formData.get("usuario_id") as string,
  });
  if (error) return { error: error.message };

  revalidatePath("/gestor/tecnicos");
  return { success: true };
}
