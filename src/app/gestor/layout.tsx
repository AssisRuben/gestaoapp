import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import Link from "next/link";
import { isGestor, getPropriedadesDoUsuario } from "@/lib/propriedade";
import { logout } from "../(app)/actions";
import { GestorTopNav, GestorBottomNav } from "./gestor-nav";

export default async function GestorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const [gestor, vinculos] = await Promise.all([isGestor(), getPropriedadesDoUsuario()]);
  if (!gestor) {
    redirect("/");
  }

  return (
    <div className="flex flex-1 flex-col">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b print:hidden border-black/[.08] px-3 py-2.5 sm:px-6 sm:py-3 dark:border-white/[.145]">
        <Image
          src="/gestao-pec-logo.png"
          alt="Gestão Pec"
          width={776}
          height={768}
          sizes="80px"
          className="h-16 w-auto shrink-0 sm:h-20"
        />

        <span className="truncate text-center text-lg font-bold text-black sm:text-2xl lg:text-3xl dark:text-zinc-50">
          Visão do Gestor
        </span>

        <div className="flex items-center gap-3">
          {vinculos.length > 0 && (
            <Link href="/" className="rounded-full border border-black/[.08] px-3 py-1.5 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]">
              Minha fazenda
            </Link>
          )}
          <GestorTopNav />
          <form action={logout}>
            <button
              type="submit"
              className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col pb-16 sm:pb-0">{children}</main>

      <GestorBottomNav />
    </div>
  );
}
