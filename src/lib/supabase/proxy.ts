import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { USER_ID_HEADER } from "./user-header";

export async function updateSession(request: NextRequest) {
  const cookiesParaAtualizar: { name: string; value: string; options: CookieOptions }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          cookiesParaAtualizar.push(...cookiesToSet);
        },
      },
    },
  );

  // Importante: chamar getUser() aqui é o que de fato revalida o token e
  // atualiza os cookies de sessão a cada request. Sem essa chamada, sessões
  // expiram silenciosamente no meio do uso.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Repassa o user.id já validado aqui pros Server Components via header, pra
  // eles não precisarem chamar getUser() de novo (outro round-trip à API de
  // Auth) só pra saber quem está logado — a validação já aconteceu.
  const requestHeaders = new Headers(request.headers);
  if (user) {
    requestHeaders.set(USER_ID_HEADER, user.id);
  } else {
    requestHeaders.delete(USER_ID_HEADER);
  }

  const supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
  cookiesParaAtualizar.forEach(({ name, value, options }) =>
    supabaseResponse.cookies.set(name, value, options),
  );

  return { supabaseResponse, user };
}
