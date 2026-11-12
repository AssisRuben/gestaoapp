import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FazendasClient } from "./fazendas-client";

// Cadastro de fazendas de acompanhamento (0056). Só técnico autorizado pelo gestor; as RPCs conferem
// de novo.
export default async function FazendasPage() {
  const supabase = await createClient();
  const { data: pode } = await supabase.rpc("posso_cadastrar_fazendas");
  if (pode !== true) redirect("/");

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pb-24 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Cadastrar fazendas</h1>
        <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← Voltar ao início
        </Link>
      </div>
      <p className="text-zinc-600 dark:text-zinc-400">
        As fazendas cadastradas aqui ficam <strong>sem WhatsApp e sem acesso do produtor</strong>: só você lança e
        acompanha os dados. Depois de cadastrar, troque de fazenda pelo seletor do cabeçalho e use Vacas → Importar
        planilha para colocar o rebanho.
      </p>
      <FazendasClient />
    </div>
  );
}
