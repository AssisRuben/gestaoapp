import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { USER_ID_HEADER } from "./user-header";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll chamado a partir de um Server Component: ignorado porque
            // o middleware já cuida de refresh de sessão nesse caso.
          }
        },
      },
    },
  );
}

// O middleware (proxy.ts) já chama supabase.auth.getUser() — um round-trip
// real à API de Auth — pra validar a sessão em toda requisição, e repassa o
// id já validado via header. Ler esse header aqui evita repetir o mesmo
// round-trip de novo em cada Server Component. cache() ainda memoiza por
// request, então mesmo chamado em layout + página, só lê uma vez.
//
// Se o header não vier (ex.: chamado fora do fluxo normal de middleware),
// cai pro caminho antigo — chamar o Supabase de verdade — em vez de tratar
// como "sem usuário", pra nunca derrubar sessões válidas por engano.
export const getUser = cache(async (): Promise<{ id: string } | null> => {
  const headerStore = await headers();
  const id = headerStore.get(USER_ID_HEADER);
  if (id) return { id };

  const supabase = await createClient();
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user ? { id: user.id } : null;
  } catch {
    // Cookie de sessão inválido/expirado (refresh token que não existe mais) — trata como
    // "sem usuário" em vez de deixar o erro subir sem tratamento.
    return null;
  }
});
