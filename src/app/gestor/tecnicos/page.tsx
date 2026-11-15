import { exigirGestor } from "@/lib/propriedade";
import { createClient, getUser } from "@/lib/supabase/server";
import { getResumoFazendasCache } from "@/lib/cached-data";
import { normalizarResumo } from "@/lib/gestor";
import { TecnicosClient, type AcessoFazenda, type FazendaOpcao } from "./tecnicos-client";
import { GestoresSecao, type Gestor } from "./gestores-secao";
import { CadastradoresSecao, type Cadastrador } from "./cadastradores-secao";
import { LimiteBotSecao, type UsoBot } from "./limite-bot-secao";

// Sem cache: muda só quando alguém dá/tira acesso, e quem olha esta tela quer ver o estado atual.
// O layout do gestor já validou isGestor(); as RPCs conferem de novo.
export default async function GestorTecnicosPage() {
  await exigirGestor();
  const supabase = await createClient();
  const [
    { data, error },
    resumoData,
    { data: gestoresData, error: gestoresErro },
    usuario,
    { data: cadastradoresData, error: cadastradoresErro },
    { data: usoBotData, error: usoBotErro },
  ] = await Promise.all([
    supabase.rpc("acessos_todas_fazendas"),
    getResumoFazendasCache(),
    supabase.rpc("listar_gestores"),
    getUser(),
    supabase.rpc("listar_tecnicos_cadastradores"),
    supabase.rpc("gestor_uso_bot"),
  ]);

  // uma linha por fazenda (bem menos que o limite de 1000 linhas do PostgREST)
  const usosBot = (usoBotData ?? []) as UsoBot[];
  // o padrão vive no banco (_limite_bot_padrao); qualquer fazenda sem limite próprio mostra qual é
  const padraoBot = usosBot.find((u) => u.limite_proprio === null)?.limite ?? 30;

  const fazendas: FazendaOpcao[] = normalizarResumo(resumoData)
    .map((r) => ({ id: r.propriedade_id, nome: r.nome_propriedade }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
      {/* sem a migration 0037 a lista de gestores não existe: a seção só não aparece */}
      {!gestoresErro && <GestoresSecao gestores={(gestoresData ?? []) as Gestor[]} usuarioId={usuario?.id ?? null} />}
      {/* sem a migration 0056 a lista não existe: a seção só não aparece */}
      {!cadastradoresErro && <CadastradoresSecao cadastradores={(cadastradoresData ?? []) as Cadastrador[]} />}
      {/* sem a migration 0059 a função não existe: a seção só não aparece */}
      {!usoBotErro && <LimiteBotSecao usos={usosBot} padrao={padraoBot} />}
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
