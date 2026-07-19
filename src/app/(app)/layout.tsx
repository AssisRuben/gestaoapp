import Image from "next/image";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import { getPropriedadesDoUsuario, getPropriedadeAtual } from "@/lib/propriedade";
import { PropriedadeSelect } from "./propriedade-select";
import { BottomNav } from "./bottom-nav";
import { TopNav } from "./top-nav";
import { FazendaTrigger } from "./fazenda-trigger";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

  if (!user) {
    redirect("/login");
  }

  const vinculos = await getPropriedadesDoUsuario();
  const propriedadeAtual = await getPropriedadeAtual();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-black/[.08] px-3 py-2.5 sm:px-6 sm:py-3 dark:border-white/[.145]">
        <Image
          src="/gestao-pec-logo.png"
          alt="Gestão Pec"
          width={776}
          height={768}
          sizes="80px"
          className="h-16 w-auto shrink-0 sm:h-20"
        />

        <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1">
          {propriedadeAtual ? (
            <FazendaTrigger propriedade={propriedadeAtual} />
          ) : (
            <span className="truncate text-lg font-semibold text-zinc-600 dark:text-zinc-400">
              Nenhuma propriedade vinculada
            </span>
          )}
          {vinculos.length > 1 && propriedadeAtual && (
            <PropriedadeSelect vinculos={vinculos} atualId={propriedadeAtual.id} />
          )}
        </div>

        <TopNav />
      </header>

      <main className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</main>

      <BottomNav />
    </div>
  );
}
