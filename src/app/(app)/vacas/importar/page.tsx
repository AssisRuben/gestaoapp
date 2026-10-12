import Link from "next/link";
import { getPropriedadeAtual } from "@/lib/propriedade";
import { SemPropriedade } from "../../sem-propriedade";
import { ImportarClient } from "./importar-client";

// Importação do rebanho por planilha (0045). Produtor e técnico da fazenda; o banco confere tudo.
export default async function ImportarPage() {
  const propriedadeAtual = await getPropriedadeAtual();
  if (!propriedadeAtual) return <SemPropriedade />;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pb-24 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Importar planilha do rebanho</h1>
        <Link href="/vacas" className="text-sm text-zinc-600 hover:underline dark:text-zinc-400">
          ← Voltar pras Vacas
        </Link>
      </div>
      <ImportarClient nomeFazenda={propriedadeAtual.nome_propriedade} />
    </div>
  );
}
