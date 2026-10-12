"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";

export type CadastrarVacaState = { error?: string; success?: boolean } | undefined;

export async function cadastrarVaca(
  _state: CadastrarVacaState,
  formData: FormData,
): Promise<CadastrarVacaState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) {
    return { error: "Nenhuma propriedade vinculada à sua conta." };
  }

  const numeroRaw = formData.get("numero_identificacao") as string;
  const maeIdRaw = formData.get("mae_id") as string;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cadastrar_vaca", {
    p_propriedade_id: propriedadeAtual.id,
    p_numero_identificacao: numeroRaw ? Number(numeroRaw) : null,
    p_mae_id: maeIdRaw || null,
    p_status_produtivo: formData.get("status_produtivo") as string,
    p_status_reprodutivo: formData.get("status_reprodutivo") as string,
  });

  if (error) {
    return { error: error.message };
  }

  const nome = String(formData.get("nome") ?? "").trim();
  const vacaId = (data as { id?: string } | null)?.id;
  if (nome && vacaId) {
    const { error: erroNome } = await supabase.rpc("definir_nome_vaca", { p_vaca_id: vacaId, p_nome: nome });
    if (erroNome) return { error: `Vaca cadastrada, mas o nome não foi salvo: ${erroNome.message}` };
  }

  revalidatePath("/vacas");
  updateTag("vacas");
  updateTag("bezerros");
  return { success: true };
}

export type DeletarVacaState = { error?: string; success?: boolean } | undefined;

export async function deletarVaca(
  _state: DeletarVacaState,
  formData: FormData,
): Promise<DeletarVacaState> {
  const vacaId = formData.get("vaca_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_vaca", { p_vaca_id: vacaId });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/vacas");
  updateTag("vacas");
  return { success: true };
}

export type AtualizarVacaState = { error?: string; success?: boolean } | undefined;

export async function atualizarVaca(
  _state: AtualizarVacaState,
  formData: FormData,
): Promise<AtualizarVacaState> {
  const vacaId = formData.get("vaca_id") as string;
  const maeIdRaw = formData.get("mae_id") as string;

  const supabase = await createClient();
  const { error } = await supabase.rpc("atualizar_vaca", {
    p_vaca_id: vacaId,
    p_numero_identificacao: Number(formData.get("numero_identificacao")),
    p_mae_id: maeIdRaw || null,
    p_status_produtivo: formData.get("status_produtivo") as string,
    p_status_reprodutivo: formData.get("status_reprodutivo") as string,
  });

  if (error) {
    return { error: error.message };
  }

  if (formData.has("nome")) {
    const { error: erroNome } = await supabase.rpc("definir_nome_vaca", {
      p_vaca_id: vacaId,
      p_nome: String(formData.get("nome") ?? ""),
    });
    if (erroNome) return { error: erroNome.message };
  }

  revalidatePath("/vacas");
  updateTag("vacas");
  return { success: true };
}

// Importação por planilha (0045). A leitura do arquivo é no navegador (src/lib/planilha-rebanho.ts);
// conferência e gravação são do banco: modo "validar" roda tudo e desfaz, pra prévia.
export type ResultadoImportacao = {
  ok: boolean;
  importado: boolean;
  erros: { aba: string; linha: number; mensagem: string }[];
  contagem: { vacas: number; bezerros: number; leite: number };
};

export async function importarRebanho(
  dados: unknown,
  modo: "validar" | "importar" | "importar_ok",
): Promise<{ resultado?: ResultadoImportacao; error?: string }> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return { error: "Nenhuma propriedade vinculada à sua conta." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("importar_rebanho", {
    p_propriedade_id: propriedadeAtual.id,
    p_dados: dados,
    p_modo: modo,
  });
  if (error) return { error: error.message };

  const resultado = data as ResultadoImportacao;
  if (resultado.importado) {
    for (const tag of ["vacas", "partos", "coberturas", "bezerros", "leite", "propriedades"]) updateTag(tag);
    revalidatePath("/", "layout");
  }
  return { resultado };
}
