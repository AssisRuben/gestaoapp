import { createServiceClient } from "@/lib/supabase/service";
import { EntidadesClient, type Entidade, type FazendaEntidade } from "./entidades-client";

// Performance por entidade (0049): a fazenda conta em toda entidade por onde recebeu doses. O layout
// do gestor já validou isGestor() — por isso a leitura com service role. Sem cache: poucas linhas, e
// quem abre quer ver o número de agora.
export default async function EntidadesPage() {
  const supabase = createServiceClient();
  const [{ data: entidades, error: e1 }, { data: fazendas, error: e2 }] = await Promise.all([
    supabase.rpc("indicadores_entidades"),
    supabase.rpc("indicadores_entidades_fazendas"),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-zinc-50">Entidades</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Cada entidade reúne as fazendas que receberam doses por ela. Os índices somam as fazendas, pela mesma
          régua do ranking (últimos 30 dias de leite e 12 meses de financeiro).
        </p>
      </div>
      {e1 || e2 ? (
        <p className="text-red-600 dark:text-red-400">
          Não consegui carregar as entidades: {(e1 ?? e2)?.message}. A migration 0049 já foi rodada?
        </p>
      ) : (
        <EntidadesClient entidades={(entidades ?? []) as Entidade[]} fazendas={(fazendas ?? []) as FazendaEntidade[]} />
      )}
    </div>
  );
}
