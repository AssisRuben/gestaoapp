import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";

// Fazendas de acompanhamento (0056: cadastradas por técnico, sem plano pago, sem WhatsApp e sem
// lançamento diário) ficam FORA do painel do gestor por padrão — senão geram alerta de "sem lançamento"
// e puxam médias e rankings. O gestor liga "mostrar acompanhamento" no cabeçalho (cookie); a tela de
// Acessos e o resumo de uma fazenda aberta pelo link continuam enxergando todas.
// Quem chama já validou isGestor() (layout do gestor ou o próprio route handler).

export const COOKIE_VER_ACOMPANHAMENTO = "gestor_ver_acompanhamento";

const getIdsAcompanhamentoCache = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = createServiceClient();
    const ids: string[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase
        .from("propriedades")
        .select("id")
        .eq("plano", "acompanhamento")
        .order("id")
        .range(de, de + 999);
      // sem a migration 0056 a coluna não existe: nada é acompanhamento, o painel segue igual
      if (error) return [];
      ids.push(...(data ?? []).map((p) => p.id as string));
      if (!data || data.length < 1000) return ids;
    }
  },
  ["ids-acompanhamento-cache"],
  { revalidate: 30, tags: ["propriedades"] },
);

export async function verAcompanhamento(): Promise<boolean> {
  return (await cookies()).get(COOKIE_VER_ACOMPANHAMENTO)?.value === "1";
}

export async function quantasAcompanhamento(): Promise<number> {
  return (await getIdsAcompanhamentoCache()).length;
}

// ids das fazendas a esconder agora (vazio quando o gestor escolheu ver todas)
export async function propriedadesOcultas(): Promise<Set<string>> {
  if (await verAcompanhamento()) return new Set();
  return new Set(await getIdsAcompanhamentoCache());
}

export function semOcultas<T>(linhas: T[], ocultas: Set<string>): T[] {
  if (ocultas.size === 0) return linhas;
  return linhas.filter((l) => !ocultas.has(String((l as Record<string, unknown>).propriedade_id)));
}
