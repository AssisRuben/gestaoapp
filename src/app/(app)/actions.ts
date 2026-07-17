"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PROPRIEDADE_COOKIE } from "@/lib/propriedade";

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function trocarPropriedade(formData: FormData) {
  const propriedadeId = formData.get("propriedade_id") as string;
  const cookieStore = await cookies();
  cookieStore.set(PROPRIEDADE_COOKIE, propriedadeId, { path: "/" });
  redirect("/");
}
