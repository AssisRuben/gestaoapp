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
