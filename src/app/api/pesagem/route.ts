import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Envio da pesagem do dia (tela /leite/pesagem), inclusive das pesagens guardadas no celular sem
// internet e enviadas depois. Endereço fixo de propósito: o id de uma Server Action muda a cada
// deploy, e uma pesagem guardada antes de uma atualização não conseguiria mais ser enviada.
// Reenviar é seguro — registrar_pesagem (0026) corrige a mesma ordenha em vez de duplicar.
//
// Sempre responde JSON. 401 = sessão expirada (o celular mantém a pesagem na fila).

type Corpo = {
  propriedadeId?: string;
  data?: string;
  periodo?: string;
  itens?: { vaca_id: string; litros: number }[];
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sua sessão expirou. Entre de novo pra enviar a pesagem." }, { status: 401 });
  }

  let corpo: Corpo;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Pesagem inválida." }, { status: 400 });
  }
  if (!corpo.propriedadeId || !corpo.data || !corpo.periodo || !Array.isArray(corpo.itens)) {
    return NextResponse.json({ error: "Pesagem incompleta." }, { status: 400 });
  }

  // a função confere o vínculo do usuário com a fazenda (sem vínculo → erro, não grava)
  const { data, error } = await supabase.rpc("registrar_pesagem", {
    p_propriedade_id: corpo.propriedadeId,
    p_data_controle: corpo.data,
    p_periodo: corpo.periodo,
    p_itens: corpo.itens,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 422 });
  }

  revalidatePath("/leite");
  revalidateTag("leite", { expire: 0 });
  return NextResponse.json(data);
}
