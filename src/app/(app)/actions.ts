"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PROPRIEDADE_COOKIE } from "@/lib/propriedade";
import { perfilRespondido } from "@/lib/perfil-fazenda-form";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// Conta sem fazenda (entrou com Google, por exemplo) cadastra a própria fazenda (0047): igual ao
// "Sou produtor" do cadastro — cria a fazenda e libera o WhatsApp pro bot.
export type CriarFazendaState = { error?: string } | undefined;

export async function criarMinhaFazenda(_state: CriarFazendaState, formData: FormData): Promise<CriarFazendaState> {
  const texto = (campo: string) => String(formData.get(campo) ?? "").trim() || null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("criar_minha_fazenda", {
    p_nome_propriedade: texto("nome_propriedade") ?? "",
    p_nome_produtor: texto("nome_produtor") ?? "",
    p_whatsapp: texto("whatsapp") ?? "",
    p_municipio: texto("municipio"),
    p_estado: texto("estado"),
    p_tecnico_responsavel: null,
    // marcada por "Usar minha localização" (0048); fora do limite o banco descarta
    p_latitude: Number.isFinite(Number(texto("latitude"))) && texto("latitude") ? Number(texto("latitude")) : null,
    p_longitude: Number.isFinite(Number(texto("longitude"))) && texto("longitude") ? Number(texto("longitude")) : null,
  });
  if (error) return { error: error.message };

  // perguntas do perfil (0053): a fazenda já está criada, então uma resposta recusada não desfaz o
  // cadastro — o produtor corrige depois no modal da fazenda
  const perfil = perfilRespondido(formData);
  if (perfil) await supabase.rpc("salvar_perfil_fazenda", { p_propriedade_id: data as string, p_dados: perfil });

  const cookieStore = await cookies();
  cookieStore.set(PROPRIEDADE_COOKIE, data as string, { path: "/" });
  updateTag("propriedades");
  redirect("/");
}

export async function trocarPropriedade(formData: FormData) {
  const propriedadeId = formData.get("propriedade_id") as string;
  const cookieStore = await cookies();
  cookieStore.set(PROPRIEDADE_COOKIE, propriedadeId, { path: "/" });

  // só caminho interno de um nível ("/leite"), nunca URL de fora
  const voltar = String(formData.get("voltar") ?? "/");
  redirect(/^\/[a-z-]*$/.test(voltar) ? voltar : "/");
}
