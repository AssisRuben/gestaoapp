import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const PROPRIEDADE_COOKIE = "propriedade_id";

export type Propriedade = {
  id: string;
  nome_propriedade: string;
  nome_produtor: string;
  municipio: string | null;
  estado: string | null;
};

export type VinculoPropriedade = {
  papel: string;
  propriedade: Propriedade;
};

export async function getPropriedadesDoUsuario(): Promise<VinculoPropriedade[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data } = await supabase
    .from("usuarios_propriedades")
    .select("papel, propriedade:propriedades(id, nome_propriedade, nome_produtor, municipio, estado)")
    .eq("usuario_id", user.id);

  return (data ?? []) as unknown as VinculoPropriedade[];
}

export async function getPropriedadeAtual(): Promise<Propriedade | null> {
  const vinculos = await getPropriedadesDoUsuario();
  if (vinculos.length === 0) return null;

  const cookieStore = await cookies();
  const propriedadeIdCookie = cookieStore.get(PROPRIEDADE_COOKIE)?.value;

  const vinculoSelecionado =
    vinculos.find((v) => v.propriedade.id === propriedadeIdCookie) ?? vinculos[0];

  return vinculoSelecionado.propriedade;
}
