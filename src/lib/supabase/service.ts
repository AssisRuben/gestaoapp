import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente com a service role key — ignora Row Level Security. Só pode ser
// usado dentro de funções cacheadas (unstable_cache), que não têm acesso a
// cookies()/headers() e por isso não conseguem montar o cliente autenticado
// do usuário. Quem chama essas funções cacheadas é responsável por já ter
// validado, via sessão do usuário, que ele tem acesso à propriedade_id
// passada como argumento — este cliente não faz nenhuma checagem sozinho.
//
// "server-only" garante em build time que este arquivo nunca acaba num bundle
// de cliente (a service role key nunca pode chegar ao navegador).
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
