"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isGestor } from "@/lib/propriedade";
import { COOKIE_VER_ACOMPANHAMENTO, verAcompanhamento } from "@/lib/gestor-plano";

// Liga/desliga a visão das fazendas de acompanhamento no painel do gestor (cookie por navegador).
export async function alternarVerAcompanhamento() {
  if (!(await isGestor())) return;
  const jar = await cookies();
  if (await verAcompanhamento()) jar.delete(COOKIE_VER_ACOMPANHAMENTO);
  else jar.set(COOKIE_VER_ACOMPANHAMENTO, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/gestor", "layout");
}
