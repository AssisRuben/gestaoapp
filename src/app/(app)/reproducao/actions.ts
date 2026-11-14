"use server";

import { revalidatePath, updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadeAtual } from "@/lib/propriedade";
import { createServiceClient } from "@/lib/supabase/service";
import { BUCKET_BOTIJAO } from "@/lib/botijao";

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
    // "tecnico" = a dose é de quem está registrando (0055)
    p_dose_tecnico: formData.get("dose_origem") === "tecnico",
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
    // sem a escolha no formulário, mantém de quem era a dose (0055)
    p_dose_tecnico: formData.has("dose_origem") ? formData.get("dose_origem") === "tecnico" : null,
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

// ===== Doses com o técnico (0055) =====

function revalidarDosesTecnico() {
  revalidatePath("/reproducao");
  revalidatePath("/campo");
  revalidatePath("/gestor/programa");
  updateTag("entregas_doses");
}

export async function confirmarDosesTecnico(_state: BaixaDosesState, formData: FormData): Promise<BaixaDosesState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirmar_recebimento_doses_tecnico", {
    p_entrega_id: formData.get("entrega_id") as string,
  });
  if (error) return { error: error.message };
  revalidarDosesTecnico();
  return { success: true };
}

export async function registrarBaixaDosesTecnico(_state: BaixaDosesState, formData: FormData): Promise<BaixaDosesState> {
  const quantidade = Number(formData.get("quantidade"));
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: "A quantidade deve ser um número inteiro maior que zero." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_baixa_doses_tecnico", {
    p_touro_id: formData.get("touro_id") as string,
    p_quantidade: quantidade,
    p_motivo: formData.get("motivo") as string,
    p_data_baixa: formData.get("data_baixa") as string,
    p_observacao: (formData.get("observacao") as string) || null,
  });
  if (error) return { error: error.message };
  revalidarDosesTecnico();
  return { success: true };
}

export async function deletarBaixaDosesTecnico(_state: BaixaDosesState, formData: FormData): Promise<BaixaDosesState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("deletar_baixa_doses_tecnico", { p_baixa_id: formData.get("baixa_id") as string });
  if (error) return { error: error.message };
  revalidarDosesTecnico();
  return { success: true };
}

// Técnico passa doses dele pra fazenda que está aberta (a fazenda confirma o recebimento).
export async function transferirDosesTecnico(_state: BaixaDosesState, formData: FormData): Promise<BaixaDosesState> {
  const propriedade = await getPropriedadeAtual();
  if (!propriedade) return { error: "Conta sem propriedade vinculada." };
  const quantidade = Number(formData.get("quantidade"));
  if (!Number.isInteger(quantidade) || quantidade <= 0) {
    return { error: "A quantidade deve ser um número inteiro maior que zero." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("transferir_doses_tecnico", {
    p_propriedade_id: propriedade.id,
    p_touro_id: formData.get("touro_id") as string,
    p_quantidade: quantidade,
    p_observacao: (formData.get("observacao") as string) || null,
  });
  if (error) return { error: error.message };
  revalidarDosesTecnico();
  return { success: true };
}

export async function cancelarTransferenciaDoses(_state: BaixaDosesState, formData: FormData): Promise<BaixaDosesState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancelar_transferencia_doses", { p_entrega_id: formData.get("entrega_id") as string });
  if (error) return { error: error.message };
  revalidarDosesTecnico();
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

// ---------------------------------------------------------------------------
// Botijão de nitrogênio (0058)
// ---------------------------------------------------------------------------

export type BotijaoState = { error?: string; success?: boolean } | undefined;

const TIPOS_FOTO: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const LIMITE_FOTO = 5 * 1024 * 1024;

// "1.234,50" e "1234.5" viram número; o resto vira NaN
function lerNumero(bruto: FormDataEntryValue | null): number {
  const t = String(bruto ?? "").trim();
  if (!t) return NaN;
  return Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
}

export async function registrarAbastecimentoBotijao(
  _state: BotijaoState,
  formData: FormData,
): Promise<BotijaoState> {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return { error: "Nenhuma propriedade vinculada à sua conta." };

  const nivel = lerNumero(formData.get("nivel_cm"));
  const valor = lerNumero(formData.get("valor"));
  const data = String(formData.get("data") ?? "");
  const foto = formData.get("foto");

  if (!Number.isFinite(nivel) || nivel < 0 || nivel > 200) return { error: "Informe o nível em cm (entre 0 e 200)." };
  if (!Number.isFinite(valor) || valor <= 0) return { error: "Informe o valor pago pelo abastecimento." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { error: "Informe a data do abastecimento." };
  if (!(foto instanceof File) || foto.size === 0) return { error: "A foto do nível é obrigatória." };
  const extensao = TIPOS_FOTO[foto.type];
  if (!extensao) return { error: "A foto precisa ser JPG, PNG ou WebP." };
  if (foto.size > LIMITE_FOTO) return { error: "A foto passa de 5 MB." };

  // o RPC confere o vínculo com a fazenda; o upload só acontece depois de a sessão já ter fazenda
  const caminho = `${propriedadeAtual.id}/${crypto.randomUUID()}.${extensao}`;
  const storage = createServiceClient().storage.from(BUCKET_BOTIJAO);
  const { error: erroUpload } = await storage.upload(caminho, await foto.arrayBuffer(), {
    contentType: foto.type,
  });
  if (erroUpload) return { error: `Não foi possível enviar a foto: ${erroUpload.message}` };

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_abastecimento_botijao", {
    p_propriedade_id: propriedadeAtual.id,
    p_data: data,
    p_nivel_cm: nivel,
    p_valor: valor,
    p_foto_path: caminho,
  });

  if (error) {
    // não deixa foto órfã quando o banco recusa
    await storage.remove([caminho]);
    return { error: error.message };
  }

  revalidatePath("/reproducao");
  revalidatePath("/financeiro");
  updateTag("financeiro");
  return { success: true };
}

export async function excluirAbastecimentoBotijao(
  _state: BotijaoState,
  formData: FormData,
): Promise<BotijaoState> {
  const supabase = await createClient();
  const { data: caminho, error } = await supabase.rpc("excluir_abastecimento_botijao", {
    p_abastecimento_id: formData.get("abastecimento_id") as string,
  });

  if (error) return { error: error.message };

  if (typeof caminho === "string" && caminho) {
    await createServiceClient().storage.from(BUCKET_BOTIJAO).remove([caminho]);
  }

  revalidatePath("/reproducao");
  revalidatePath("/financeiro");
  updateTag("financeiro");
  return { success: true };
}
