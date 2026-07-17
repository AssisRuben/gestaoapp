"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type EsqueciSenhaState = { message?: string; error?: string } | undefined;

export async function solicitarRedefinicao(
  _state: EsqueciSenhaState,
  formData: FormData,
): Promise<EsqueciSenhaState> {
  const email = formData.get("email") as string;
  const origin = (await headers()).get("origin");

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/redefinir-senha`,
  });

  if (error) {
    return { error: "Não foi possível enviar o e-mail de redefinição." };
  }

  return {
    message: "Se o e-mail existir na nossa base, você vai receber um link para redefinir a senha.",
  };
}
