"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isGestor, semAcessoGestor } from "@/lib/propriedade";
import { CAMPOS_INDICADORES } from "@/lib/programa";

// Escritas do gestor no programa de sêmen. Usa o cliente autenticado (não o service role): quem
// garante que só gestor escreve são as policies de RLS de 0018_programa_semen.sql. O isGestor()
// aqui é só pra devolver uma mensagem clara em vez do erro genérico de RLS.

export type ProgramaActionState = { error?: string; success?: boolean } | undefined;

function revalidar() {
  revalidatePath("/gestor/programa");
  revalidatePath("/reproducao");
}

function textoOuNull(valor: FormDataEntryValue | null) {
  const texto = String(valor ?? "").trim();
  return texto === "" ? null : texto;
}

export async function salvarTouro(
  _state: ProgramaActionState,
  formData: FormData,
): Promise<ProgramaActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const id = textoOuNull(formData.get("touro_id"));
  const nome = textoOuNull(formData.get("nome"));
  if (!nome) return { error: "Informe o nome do touro." };

  const ptaRaw = textoOuNull(formData.get("pta_leite"));
  const pta = ptaRaw === null ? null : Number(ptaRaw.replace(",", "."));
  if (pta !== null && Number.isNaN(pta)) return { error: "PTA de leite inválida." };

  const dados = {
    nome,
    codigo: textoOuNull(formData.get("codigo")),
    raca: textoOuNull(formData.get("raca")),
    central: textoOuNull(formData.get("central")),
    pta_leite: pta,
    // checkbox só existe no formulário de edição; touro novo nasce ativo
    ativo: id ? formData.get("ativo") === "on" : true,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("touros").update(dados).eq("id", id)
    : await supabase.from("touros").insert(dados);

  if (error) {
    if (error.code === "23505") return { error: "Já existe um touro com esse código." };
    return { error: error.message };
  }

  revalidar();
  updateTag("touros");
  return { success: true };
}

export async function excluirTouro(
  _state: ProgramaActionState,
  formData: FormData,
): Promise<ProgramaActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const id = formData.get("touro_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.from("touros").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        error:
          "Esse touro já tem entregas ou coberturas registradas e não pode ser excluído. Desmarque \"Ativo\" pra tirá-lo da lista.",
      };
    }
    return { error: error.message };
  }

  revalidar();
  updateTag("touros");
  return { success: true };
}

export async function salvarEntrega(
  _state: ProgramaActionState,
  formData: FormData,
): Promise<ProgramaActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const id = textoOuNull(formData.get("entrega_id"));
  const quantidade = Number(formData.get("quantidade"));
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: "A quantidade deve ser um número inteiro maior que zero." };
  }

  const dados = {
    propriedade_id: formData.get("propriedade_id") as string,
    touro_id: formData.get("touro_id") as string,
    quantidade,
    data_entrega: formData.get("data_entrega") as string,
    observacao: textoOuNull(formData.get("observacao")),
  };

  const supabase = await createClient();

  if (id) {
    // a policy só deixa alterar entrega ainda não confirmada — nesse caso o update não acha
    // nenhuma linha (sem erro), então confere pelo retorno
    const { data, error } = await supabase
      .from("entregas_doses")
      .update(dados)
      .eq("id", id)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) {
      return { error: "Essa entrega já foi confirmada pela fazenda e não pode mais ser alterada." };
    }
  } else {
    const { error } = await supabase.from("entregas_doses").insert(dados);
    if (error) return { error: error.message };
  }

  revalidar();
  updateTag("entregas_doses");
  return { success: true };
}

export async function excluirEntrega(
  _state: ProgramaActionState,
  formData: FormData,
): Promise<ProgramaActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const id = formData.get("entrega_id") as string;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entregas_doses")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { error: error.message };
  if (!data?.length) {
    return { error: "Essa entrega já foi confirmada pela fazenda e não pode mais ser excluída." };
  }

  revalidar();
  updateTag("entregas_doses");
  return { success: true };
}

// Valores sugeridos pelo sistema pro formulário de adesão (o gestor revisa antes de salvar).
export async function sugerirLinhaBase(
  propriedadeId: string,
  dataAdesao: string,
): Promise<{ valores?: Record<string, number | null>; error?: string }> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("sugerir_linha_base", { p_propriedade_id: propriedadeId, p_data: dataAdesao })
    .single();

  if (error) return { error: error.message };
  return { valores: data as Record<string, number | null> };
}

export async function salvarAdesao(
  _state: ProgramaActionState,
  formData: FormData,
): Promise<ProgramaActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const propriedadeId = formData.get("propriedade_id") as string;
  const dados: Record<string, string | number | null> = {
    propriedade_id: propriedadeId,
    data_adesao: formData.get("data_adesao") as string,
    observacao: textoOuNull(formData.get("observacao")),
    updated_at: new Date().toISOString(),
  };

  for (const { campo, rotulo, tipo } of CAMPOS_INDICADORES) {
    const bruto = textoOuNull(formData.get(campo));
    if (bruto === null) {
      dados[campo] = null;
      continue;
    }
    const numero = Number(bruto.replace(",", "."));
    if (Number.isNaN(numero) || numero < 0) return { error: `Valor inválido em "${rotulo}".` };
    if (tipo === "inteiro" && !Number.isInteger(numero)) {
      return { error: `"${rotulo}" deve ser um número inteiro.` };
    }
    dados[campo] = numero;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("adesoes_programa")
    .upsert(dados, { onConflict: "propriedade_id" });

  if (error) return { error: error.message };

  revalidar();
  updateTag("adesoes");
  return { success: true };
}

export async function excluirAdesao(
  _state: ProgramaActionState,
  formData: FormData,
): Promise<ProgramaActionState> {
  if (!(await isGestor())) return { error: await semAcessoGestor() };

  const supabase = await createClient();
  const { error } = await supabase
    .from("adesoes_programa")
    .delete()
    .eq("propriedade_id", formData.get("propriedade_id") as string);

  if (error) return { error: error.message };

  revalidar();
  updateTag("adesoes");
  return { success: true };
}
