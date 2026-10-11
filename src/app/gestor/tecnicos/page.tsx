import { createClient, getUser } from "@/lib/supabase/server";
import { getResumoFazendasCache } from "@/lib/cached-data";
import { normalizarResumo } from "@/lib/gestor";
import { TecnicosClient, type AcessoFazenda, type FazendaOpcao } from "./tecnicos-client";
import { GestoresSecao, type Gestor } from "./gestores-secao";

// Sem cache: muda só quando alguém dá/tira acesso, e quem olha esta tela quer ver o estado atual.
// O layout do gestor já validou isGestor(); as RPCs conferem de novo.
export default async function GestorTecnicosPage() {
  const supabase = await createClient();
  const [{ data, error }, resumoData, { data: gestoresData, error: gestoresErro }, usuario] = await Promise.all([
    supabase.rpc("acessos_todas_fazendas"),
    getResumoFazendasCache(),
    supabase.rpc("listar_gestores"),
    getUser(),
  ]);

  const fazendas: FazendaOpcao[] = normalizarResumo(resumoData)
    .map((r) => ({ id: r.propriedade_id, nome: r.nome_propriedade }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {/* sem a migration 0037 a lista de gestores não existe: a seção só não aparece */}
      {!gestoresErro && <GestoresSecao gestores={(gestoresData ?? []) as Gestor[]} usuarioId={usuario?.id ?? null} />}
      {error ? (
        <p className="text-red-600 dark:text-red-400">
          Não foi possível carregar os acessos: {error.message}
        </p>
      ) : (
        <TecnicosClient fazendas={fazendas} acessos={(data ?? []) as AcessoFazenda[]} />
      )}
    </div>
  );
}
