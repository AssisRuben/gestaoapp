import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getPropriedadesDoUsuario, getPropriedadeAtual, isGestor } from "@/lib/propriedade";
import { BottomNav } from "./bottom-nav";
import { TopNav } from "./top-nav";
import { FazendaTrigger } from "./fazenda-trigger";
import { logout } from "./actions";
import { RegistrarOffline } from "./registrar-offline";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const [gestor, vinculos] = await Promise.all([isGestor(), getPropriedadesDoUsuario()]);

  // gestor sem fazenda própria vai direto pro painel; gestor que também é produtor/técnico usa a
  // fazenda normalmente e alterna pelo botão "Painel do gestor"
  if (gestor && vinculos.length === 0) {
    redirect("/gestor");
  }

  const propriedadeAtual = await getPropriedadeAtual();

  return (
    // overflow-x-clip: nenhum conteúdo alarga a página além da tela (barra de baixo fica parada)
    <div className="flex flex-1 flex-col overflow-x-clip">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b print:hidden border-black/[.08] px-3 py-2.5 sm:px-6 sm:py-3 dark:border-white/[.145]">
        {propriedadeAtual ? (
          <FazendaTrigger propriedade={propriedadeAtual} vinculos={vinculos} />
        ) : (
          <>
            <Image
              src="/gestao-pec-logo.png"
              alt="Gestão Pec"
              width={776}
              height={768}
              sizes="80px"
              className="h-16 w-auto shrink-0 sm:h-20"
            />
            <span className="truncate text-center text-lg font-semibold text-zinc-600 dark:text-zinc-400">
              Nenhuma propriedade vinculada
            </span>
          </>
        )}

        {propriedadeAtual ? (
          <div className="flex items-center gap-2">
            {gestor && (
              <Link href="/gestor" className="rounded-full border border-black/[.08] px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]">
                Painel do gestor
              </Link>
            )}
            <TopNav />
          </div>
        ) : (
          <form action={logout}>
            <button
              type="submit"
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Sair
            </button>
          </form>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col pb-16 sm:pb-0">{children}</main>

      {/* 6 abas apertam no celular: 4 na barra + "Mais" (Bezerros, Financeiro), como no gestor */}
      <BottomNav principais={4} />
      <RegistrarOffline />
    </div>
  );
}
