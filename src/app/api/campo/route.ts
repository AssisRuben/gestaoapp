import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Envio dos lançamentos do campo (tela /campo), inclusive os guardados no celular sem internet.
// Endereço fixo pelo mesmo motivo de /api/pesagem. Reenviar o mesmo id é seguro
// (registrar_lancamento_campo, 0035). Sempre responde JSON; 401 = sessão expirada.

const TIPOS = new Set(["cobertura", "parto", "diagnostico"]);
const TAGS: Record<string, string[]> = {
  cobertura: ["coberturas", "vacas", "entregas_doses"],
  parto: ["partos", "coberturas", "vacas", "bezerros", "leite"],
  diagnostico: ["coberturas", "vacas"],
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sua sessão expirou. Entre de novo pra enviar." }, { status: 401 });
  }

  let corpo: { id?: string; propriedadeId?: string; tipo?: string; dados?: Record<string, unknown> };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, mensagem: "Lançamento inválido." }, { status: 400 });
  }
  if (!corpo.id || !corpo.propriedadeId || !corpo.tipo || !TIPOS.has(corpo.tipo) || !corpo.dados) {
    return NextResponse.json({ ok: false, mensagem: "Lançamento incompleto." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("registrar_lancamento_campo", {
    p_id: corpo.id,
    p_propriedade_id: corpo.propriedadeId,
    p_tipo: corpo.tipo,
    p_dados: corpo.dados,
  });
  if (error) {
    return NextResponse.json({ ok: false, mensagem: error.message }, { status: 422 });
  }

  const resultado = data as { ok: boolean; mensagem: string; repetido?: boolean };
  if (resultado.ok && !resultado.repetido) {
    revalidatePath("/reproducao");
    revalidatePath("/vacas");
    for (const tag of TAGS[corpo.tipo]) revalidateTag(tag, { expire: 0 });
  }
  return NextResponse.json(resultado);
}
