import { cookies } from "next/headers";
import { cache } from "react";
import { createClient, getUser } from "@/lib/supabase/server";

export const PROPRIEDADE_COOKIE = "propriedade_id";

export type Propriedade = {
  id: string;
  nome_propriedade: string;
  nome_produtor: string;
  municipio: string | null;
  estado: string | null;
  tecnico_responsavel: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type VinculoPropriedade = {
  papel: string;
  propriedade: Propriedade;
};

export const getPropriedadesDoUsuario = cache(async (): Promise<VinculoPropriedade[]> => {
  const user = await getUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("usuarios_propriedades")
    .select(
      "papel, propriedade:propriedades(id, nome_propriedade, nome_produtor, municipio, estado, tecnico_responsavel, latitude, longitude)",
    )
    .eq("usuario_id", user.id);

  return (data ?? []) as unknown as VinculoPropriedade[];
});

// Gestor: acesso de leitura a todas as propriedades, sem vínculo por fazenda (ver
// supabase/migrations/0017_gestor.sql — tabela separada de usuarios_propriedades de propósito,
// pra nenhuma RPC de escrita existente enxergar o gestor como tendo acesso).
export const isGestor = cache(async (): Promise<boolean> => {
  const user = await getUser();
  if (!user) return false;

  const supabase = await createClient();
  const { data } = await supabase
    .from("gestores")
    .select("usuario_id")
    .eq("usuario_id", user.id)
    .maybeSingle();

  return !!data;
});

export async function getPropriedadeAtual(): Promise<Propriedade | null> {
  const vinculos = await getPropriedadesDoUsuario();
  if (vinculos.length === 0) return null;

  const cookieStore = await cookies();
  const propriedadeIdCookie = cookieStore.get(PROPRIEDADE_COOKIE)?.value;

  const vinculoSelecionado =
    vinculos.find((v) => v.propriedade.id === propriedadeIdCookie) ?? vinculos[0];

  return vinculoSelecionado.propriedade;
}
