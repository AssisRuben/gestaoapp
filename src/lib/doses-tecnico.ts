import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { DosesTecnico } from "@/lib/programa";

// Doses do programa que estão com o técnico logado (0055): entregas, saldo, perdas e transferências
// ainda não confirmadas pela fazenda. Pelo cliente do usuário — o banco só devolve as dele. Sem a
// migration (ou sem login), volta vazio e as telas seguem como antes.
export async function carregarDosesTecnico(): Promise<DosesTecnico> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const vazio: DosesTecnico = { usuarioId: user?.id ?? null, entregas: [], saldos: [], baixas: [], transferencias: [] };
  if (!user) return vazio;

  const [entregas, saldos, baixas, transferencias] = await Promise.all([
    supabase
      .from("entregas_doses_tecnico")
      .select("*, touro:touro_id(id, nome, codigo), entidade:entidade_id(nome, responsavel, telefone)")
      .eq("tecnico_id", user.id)
      .order("data_entrega", { ascending: false })
      .order("id"),
    supabase.from("saldo_doses_tecnico").select("*").eq("tecnico_id", user.id).order("touro_id"),
    supabase
      .from("baixas_doses_tecnico")
      .select("*, touro:touro_id(id, nome, codigo)")
      .eq("tecnico_id", user.id)
      .order("data_baixa", { ascending: false })
      .order("id"),
    supabase
      .from("entregas_doses")
      .select("*, touro:touro_id(id, nome, codigo), propriedade:propriedade_id(id, nome_propriedade)")
      .eq("origem_tecnico_id", user.id)
      .is("recebido_em", null)
      .order("data_entrega", { ascending: false })
      .order("id"),
  ]);
  if (entregas.error || saldos.error) return vazio;

  return {
    usuarioId: user.id,
    entregas: (entregas.data ?? []) as unknown as DosesTecnico["entregas"],
    saldos: ((saldos.data ?? []) as unknown as DosesTecnico["saldos"]).map((s) => ({
      ...s,
      recebidas: Number(s.recebidas),
      a_receber: Number(s.a_receber),
      utilizadas: Number(s.utilizadas),
      baixas: Number(s.baixas),
      transferidas: Number(s.transferidas),
      saldo: Number(s.saldo),
    })),
    baixas: (baixas.data ?? []) as unknown as DosesTecnico["baixas"],
    transferencias: (transferencias.data ?? []) as unknown as DosesTecnico["transferencias"],
  };
}
