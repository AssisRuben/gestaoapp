"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor, semAcessoGestor } from "@/lib/propriedade";

export type EntidadeState = { error?: string; success?: boolean } | undefined;

// Cadastro/edição de entidade pela aba Entidades (0050). CNPJ conferido no banco.
export async function salvarEntidade(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const texto = (campo: string) => String(formData.get(campo) ?? "").trim() || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("gestor_editar_entidade", {
    p_id: texto("entidade_id"),
    p_nome: texto("nome") ?? "",
    p_cnpj: texto("cnpj"),
    p_responsavel: texto("responsavel"),
    p_telefone: texto("telefone"),
  });
  if (error) return { error: error.message };

  updateTag("entregas_doses"); // as entregas mostram nome/responsável da entidade
  revalidatePath("/gestor/entidades");
  revalidatePath("/gestor/programa");
  return { success: true };
}

// ============================================================
// Doses e kits da entidade (0068). Escrita pela sessão do gestor (policies de gestor).
// ============================================================

const texto = (formData: FormData, campo: string) => String(formData.get(campo) ?? "").trim() || null;

function revalidarEntidades(comPrograma = false) {
  revalidatePath("/gestor/entidades");
  if (comPrograma) revalidatePath("/gestor/programa");
}

// Doses que a entidade recebeu do programa: entram no saldo dela; a entrega pra fazenda/técnico sai dele.
export async function registrarDosesEntidade(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const quantidade = Number(formData.get("quantidade"));
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: "A quantidade deve ser um número inteiro maior que zero." };
  }
  const entidadeId = texto(formData, "entidade_id");
  const touroId = texto(formData, "touro_id");
  const data = texto(formData, "data_entrega");
  if (!entidadeId || !touroId || !data) return { error: "Escolha o touro e a data." };

  const supabase = await createClient();
  const { error } = await supabase.from("entregas_doses_entidade").insert({
    entidade_id: entidadeId,
    touro_id: touroId,
    quantidade,
    data_entrega: data,
    observacao: texto(formData, "observacao"),
  });
  if (error) return { error: error.message };

  revalidarEntidades(true);
  return { success: true };
}

// O banco recusa se as doses já foram repassadas (o saldo ficaria negativo).
export async function excluirDosesEntidade(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entregas_doses_entidade")
    .delete()
    .eq("id", texto(formData, "id") ?? "")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Registro não encontrado." };

  revalidarEntidades(true);
  return { success: true };
}

export async function salvarKit(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const patrimonio = texto(formData, "patrimonio");
  const entidadeId = texto(formData, "entidade_id");
  if (!patrimonio || !entidadeId) return { error: "Informe o número de patrimônio do kit." };

  const supabase = await createClient();
  const { error } = await supabase.from("kits_inseminacao").insert({
    entidade_id: entidadeId,
    patrimonio,
    processo: texto(formData, "processo"),
  });
  if (error) {
    if (error.code === "23505") return { error: `O patrimônio ${patrimonio} já está cadastrado.` };
    return { error: error.message };
  }

  revalidarEntidades();
  return { success: true };
}

export async function excluirKit(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kits_inseminacao")
    .delete()
    .eq("id", texto(formData, "id") ?? "")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Kit não encontrado." };

  revalidarEntidades();
  return { success: true };
}

// Cessão de uso: o kit continua da entidade e fica com uma fazenda OU um técnico.
export async function cederKit(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const paraTecnico = formData.get("destino") === "tecnico";
  const destinoId = texto(formData, paraTecnico ? "tecnico_id" : "propriedade_id");
  if (!destinoId) return { error: paraTecnico ? "Escolha o técnico." : "Escolha a fazenda." };
  const data = texto(formData, "cedido_em");
  if (!data) return { error: "Informe a data da cessão." };

  const supabase = await createClient();
  const { data: linhas, error } = await supabase
    .from("kits_inseminacao")
    .update({
      propriedade_id: paraTecnico ? null : destinoId,
      tecnico_id: paraTecnico ? destinoId : null,
      cedido_em: data,
      observacao: texto(formData, "observacao"),
    })
    .eq("id", texto(formData, "id") ?? "")
    .select("id");
  if (error) return { error: error.message };
  if (!linhas?.length) return { error: "Kit não encontrado." };

  revalidarEntidades();
  return { success: true };
}

// O kit volta pra entidade (fim da cessão).
export async function devolverKit(_state: EntidadeState, formData: FormData): Promise<EntidadeState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kits_inseminacao")
    .update({ propriedade_id: null, tecnico_id: null, cedido_em: null, observacao: null })
    .eq("id", texto(formData, "id") ?? "")
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Kit não encontrado." };

  revalidarEntidades();
  return { success: true };
}
