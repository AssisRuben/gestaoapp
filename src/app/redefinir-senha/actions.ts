"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RedefinirSenhaState = { error?: string } | undefined;

export async function redefinirSenha(
  _state: RedefinirSenhaState,
  formData: FormData,
): Promise<RedefinirSenhaState> {
  const password = formData.get("password") as string;
  const confirmacao = formData.get("confirmacao") as string;

  if (password.length < 8) {
    return { error: "A senha precisa ter pelo menos 8 caracteres." };
  }
  if (password !== confirmacao) {
    return { error: "As senhas não coincidem." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { error: "Não foi possível redefinir a senha. Solicite um novo link." };
  }

  redirect("/");
}
