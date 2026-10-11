"use server";

import { createClient } from "@/lib/supabase/server";

export type CadastroState = { error?: string; success?: boolean } | undefined;

export async function cadastrarNovaFazenda(
  _state: CadastroState,
  formData: FormData,
): Promise<CadastroState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome_propriedade: formData.get("nome_propriedade") as string,
        nome_produtor: formData.get("nome_produtor") as string,
        municipio: (formData.get("municipio") as string) || null,
        estado: (formData.get("estado") as string) || null,
        tecnico_responsavel: (formData.get("tecnico_responsavel") as string) || null,
        whatsapp: (formData.get("whatsapp") as string) || null,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}

// Conta sem fazenda: sem nome_propriedade no metadata o trigger de 0013 não cria propriedade. O
// acesso às fazendas vem depois, pelo produtor ou pelo gestor (0023_acesso_tecnicos.sql).
export async function cadastrarTecnico(
  _state: CadastroState,
  formData: FormData,
): Promise<CadastroState> {
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe seu nome." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: { data: { nome, perfil: "tecnico" } },
  });

  if (error) {
    return { error: error.message };
  }

  return { success: true };
}
