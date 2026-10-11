import { createClient } from "@/lib/supabase/server";

export async function SemPropriedade() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex flex-1 items-center justify-center p-6 text-center sm:p-16">
      <div className="flex max-w-md flex-col gap-2 text-zinc-600 dark:text-zinc-400">
        <p>
          Sua conta{user?.email ? ` (${user.email})` : ""} ainda não tem acesso a nenhuma
          propriedade.
        </p>
        <p className="text-sm">
          Se você é técnico, peça ao produtor (no site, tocando no nome da fazenda → Acessos) ou ao
          gestor do programa pra liberar seu acesso por este e-mail.
        </p>
      </div>
    </div>
  );
}
