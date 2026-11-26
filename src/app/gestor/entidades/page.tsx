import { exigirGestor } from "@/lib/propriedade";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { getPropriedadesTodasCache, getTourosCache } from "@/lib/cached-data";
import type { Touro, TecnicoPrograma } from "@/lib/programa";
import { EntidadesClient, type Entidade, type FazendaEntidade } from "./entidades-client";
import type { KitEntidade, DosesRecebidasEntidade, SaldoEntidade } from "./kits-doses";

// Performance por entidade (0049): a fazenda conta em toda entidade por onde recebeu doses. O layout
// do gestor já validou isGestor() — por isso a leitura com service role. Sem cache: poucas linhas, e
// quem abre quer ver o número de agora.
export default async function EntidadesPage() {
  await exigirGestor();
  const supabase = createServiceClient();
  const [
    { data: entidades, error: e1 },
    { data: fazendas, error: e2 },
    { data: kits, error: e3 },
    { data: recebidas, error: e4 },
    { data: saldos, error: e5 },
    propriedades,
    touros,
    { data: tecnicos },
  ] = await Promise.all([
    supabase.rpc("indicadores_entidades"),
    supabase.rpc("indicadores_entidades_fazendas"),
    // kits e doses da entidade (0068) — poucas centenas de linhas, abaixo do limite de 1000
    supabase.from("kits_inseminacao").select("*").order("patrimonio").order("id"),
    supabase.from("entregas_doses_entidade").select("*").order("data_entrega", { ascending: false }).order("id"),
    supabase.from("saldo_doses_entidade").select("*"),
    getPropriedadesTodasCache(),
    getTourosCache(),
    (await createClient()).rpc("listar_tecnicos_programa"),
  ]);
  const erroKits = e3 ?? e4 ?? e5;

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
        <>
          {erroKits && (
            <p className="text-red-600 dark:text-red-400">
              Não consegui carregar kits e doses das entidades: {erroKits.message}. A migration 0068 já foi rodada?
            </p>
          )}
          <EntidadesClient
            entidades={(entidades ?? []) as Entidade[]}
            fazendas={(fazendas ?? []) as FazendaEntidade[]}
            kits={(kits ?? []) as KitEntidade[]}
            recebidas={(recebidas ?? []) as DosesRecebidasEntidade[]}
            saldos={((saldos ?? []) as SaldoEntidade[]).map((s) => ({
              ...s,
              recebidas: Number(s.recebidas),
              repassadas: Number(s.repassadas),
              saldo: Number(s.saldo),
            }))}
            opcoes={{
              touros: touros as unknown as Touro[],
              propriedades: (propriedades as { id: string; nome_propriedade: string }[])
                .map((p) => ({ id: p.id, nome_propriedade: p.nome_propriedade }))
                .sort((a, b) => a.nome_propriedade.localeCompare(b.nome_propriedade, "pt-BR")),
              tecnicos: (tecnicos ?? []) as TecnicoPrograma[],
            }}
          />
        </>
      )}
    </div>
  );
}
