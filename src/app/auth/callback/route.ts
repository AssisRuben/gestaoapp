import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redirecionar, destinoInterno } from "@/lib/redirecionar";

// Volta do login com Google.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = destinoInterno(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirecionar(next);
    }
  }

  return redirecionar("/login?error=oauth");
}
