import Link from "next/link";
import { getPropriedadeAtual } from "@/lib/propriedade";
import { carregarResumoFazenda } from "@/lib/resumo-fazenda";
import { ResumoFazendaView } from "../../resumo-fazenda-view";
import { BotaoImprimir } from "../../botao-imprimir";
import { SemPropriedade } from "../sem-propriedade";

// Relatório da visita técnica: o resumo da fazenda atual, pronto pra imprimir ou salvar em PDF
// (o navegador salva em PDF pelo "Imprimir"). O id vem de getPropriedadeAtual(), que já confere o
// vínculo do usuário com a fazenda.
export default async function RelatorioPage() {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return <SemPropriedade />;

  const resumo = await carregarResumoFazenda(propriedadeAtual.id);
  if (!resumo) return <SemPropriedade />;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← Início
        </Link>
        <BotaoImprimir />
      </div>
      <p className="text-sm text-zinc-600 print:hidden dark:text-zinc-400">
        Resumo pra visita técnica. Pra mandar pro produtor, use &quot;Imprimir / salvar PDF&quot; e escolha
        &quot;Salvar como PDF&quot;.
      </p>
      <ResumoFazendaView resumo={resumo} linkVaca={(id) => `/vacas/${id}`} />
      <p className="hidden text-xs text-zinc-500 print:block">Gerado pelo Gestão Pec.</p>
    </div>
  );
}
