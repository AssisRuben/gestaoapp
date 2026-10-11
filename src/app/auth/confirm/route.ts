import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { redirecionar, destinoInterno } from "@/lib/redirecionar";

// Links dos e-mails (confirmar cadastro, redefinir senha, trocar e-mail): modelos em
// deploy/SMTP_BREVO.md.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = destinoInterno(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return redirecionar(next);
    }
  }

  return redirecionar("/login?error=link_invalido");
}
