import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadesDoUsuario, getPropriedadeAtual } from "@/lib/propriedade";
import { logout } from "./actions";
import { PropriedadeSelect } from "./propriedade-select";
import { BottomNav } from "./bottom-nav";
import { NAV_ITEMS } from "./nav-items";
import { FazendaTrigger } from "./fazenda-trigger";
import type { UsuarioWhatsapp, PatrimonioItem } from "./fazenda-types";

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

  let usuariosWhatsapp: UsuarioWhatsapp[] = [];
  let patrimonios: PatrimonioItem[] = [];

  if (propriedadeAtual) {
    const [{ data: whatsappData }, { data: patrimonioData }] = await Promise.all([
      supabase
        .from("usuarios_whatsapp")
        .select("id, propriedade_id, telefone, papel, ativo, created_at")
        .eq("propriedade_id", propriedadeAtual.id)
        .order("created_at"),
      supabase
        .from("patrimonio")
        .select("id, propriedade_id, tipo_ativo, valor_total, taxa_juros, vida_util, created_at")
        .eq("propriedade_id", propriedadeAtual.id)
        .order("created_at"),
    ]);
    usuariosWhatsapp = whatsappData ?? [];
    patrimonios = patrimonioData ?? [];
  }

  const usuarioWhatsapp = usuariosWhatsapp[0] ?? null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-black/[.08] px-3 py-2.5 sm:px-6 sm:py-3 dark:border-white/[.145]">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Image
            src="/gestao-pec-logo.png"
            alt="Gestão Pec"
            width={776}
            height={768}
            className="h-8 w-auto shrink-0 sm:h-10"
          />
          {propriedadeAtual ? (
            <FazendaTrigger
              propriedade={propriedadeAtual}
              usuarioWhatsapp={usuarioWhatsapp}
              patrimonios={patrimonios}
            />
          ) : (
            <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">
              Nenhuma propriedade vinculada
            </span>
          )}
          {vinculos.length > 1 && propriedadeAtual && (
            <PropriedadeSelect vinculos={vinculos} atualId={propriedadeAtual.id} />
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <nav className="hidden items-center gap-4 sm:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-sm text-zinc-600 hover:text-brand-green dark:text-zinc-400 dark:hover:text-brand-green"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Sair
            </button>
          </form>
        </div>
      </header>

      <main className="flex flex-1 flex-col pb-16 sm:pb-0">{children}</main>

      <BottomNav />
    </div>
  );
}
