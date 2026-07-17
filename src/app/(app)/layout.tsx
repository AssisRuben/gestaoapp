import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadesDoUsuario, getPropriedadeAtual } from "@/lib/propriedade";
import { logout } from "./actions";
import { PropriedadeSelect } from "./propriedade-select";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const vinculos = await getPropriedadesDoUsuario();
  const propriedadeAtual = await getPropriedadeAtual();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between border-b border-black/[.08] px-6 py-3 dark:border-white/[.145]">
        <div className="flex items-center gap-3">
          {propriedadeAtual ? (
            <span className="text-sm font-medium text-black dark:text-zinc-50">
              {propriedadeAtual.nome_propriedade}
            </span>
          ) : (
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              Nenhuma propriedade vinculada
            </span>
          )}
          {vinculos.length > 1 && propriedadeAtual && (
            <PropriedadeSelect vinculos={vinculos} atualId={propriedadeAtual.id} />
          )}
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
          >
            Sair
          </button>
        </form>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
