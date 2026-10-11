import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarResumoFazenda } from "@/lib/resumo-fazenda";
import { ResumoFazendaView } from "../../../resumo-fazenda-view";
import { BotaoImprimir } from "../../../botao-imprimir";

// Uma fazenda vista pelo gestor (só leitura). O layout de /gestor já validou isGestor().
export default async function GestorFazendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resumo = await carregarResumoFazenda(id);
  if (!resumo) notFound();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/gestor" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← Visão geral
        </Link>
        <BotaoImprimir />
      </div>
      <ResumoFazendaView resumo={resumo} />
    </div>
  );
}
