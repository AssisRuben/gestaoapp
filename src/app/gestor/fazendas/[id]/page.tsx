import Link from "next/link";
import { notFound } from "next/navigation";
import { carregarResumoFazenda } from "@/lib/resumo-fazenda";
import { ResumoFazendaView } from "../../../resumo-fazenda-view";
import { BotaoImprimir } from "../../../botao-imprimir";

// "Voltar" leva pra aba de onde a fazenda foi aberta (?de=...); sem origem, Visão geral.
const ORIGENS: Record<string, { href: string; rotulo: string }> = {
  ranking: { href: "/gestor/ranking", rotulo: "Ranking" },
  alertas: { href: "/gestor/alertas", rotulo: "Alertas" },
  acessos: { href: "/gestor/tecnicos", rotulo: "Acessos" },
};

// Uma fazenda vista pelo gestor (só leitura). O layout de /gestor já validou isGestor().
export default async function GestorFazendaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ de?: string }>;
}) {
  const [{ id }, { de }] = await Promise.all([params, searchParams]);
  const resumo = await carregarResumoFazenda(id);
  if (!resumo) notFound();
  const voltar = (de && ORIGENS[de]) || { href: "/gestor", rotulo: "Visão geral" };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={voltar.href} className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← {voltar.rotulo}
        </Link>
        <BotaoImprimir />
      </div>
      <ResumoFazendaView resumo={resumo} />
    </div>
  );
}
