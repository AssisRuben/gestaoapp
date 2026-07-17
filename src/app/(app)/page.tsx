import { getPropriedadeAtual } from "@/lib/propriedade";

export default async function DashboardPage() {
  const propriedadeAtual = await getPropriedadeAtual();

  if (!propriedadeAtual) {
    return (
      <div className="flex flex-1 items-center justify-center p-16 text-center">
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          Sua conta ainda não está vinculada a nenhuma propriedade. Fale com o
          administrador do sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 p-16">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        {propriedadeAtual.nome_propriedade}
      </h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Produtor: {propriedadeAtual.nome_produtor}
        {propriedadeAtual.municipio && ` · ${propriedadeAtual.municipio}`}
        {propriedadeAtual.estado && `/${propriedadeAtual.estado}`}
      </p>
    </div>
  );
}
