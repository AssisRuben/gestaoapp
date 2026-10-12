import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { hojeBrasil } from "@/lib/datas";

// Índices da fazenda pro PRÓPRIO produtor (Início e relatório da visita) — os mesmos números que o
// gestor vê no ranking e na linha de base: calcular_indicadores (0019) é a régua única. Inclui a
// linha de base da adesão (pra comparar "antes × hoje") e os índices reprodutivos do programa de
// sêmen (0021), quando a fazenda participa. Service role: quem chama já validou o acesso à fazenda.

export type Indicadores = {
  litrosVacaDia: number | null;
  producaoDia: number | null;
  vacasLactacao: number | null;
  receitaMensal: number | null;
  despesaMensal: number | null;
  custoLitro: number | null;
  receitaLitro: number | null; // receita mensal ÷ litros do mês (preço médio recebido, aproximado)
  sobraLitro: number | null; // receita por litro − custo por litro
};

export type IndicadoresFazenda = {
  hoje: Indicadores;
  adesao: (Indicadores & { data: string }) | null;
  programa: {
    taxaConcepcao: number | null;
    dosesPorPrenhez: number | null;
    dosesUsadas: number;
    gestacoesEmCurso: number;
    nascimentos: number;
    femeas: number;
  } | null;
};

type Linha = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

function montar(l: Linha | null | undefined): Indicadores {
  const producaoDia = num(l?.producao_dia);
  const receitaMensal = num(l?.receita_mensal);
  const custoLitro = num(l?.custo_litro);
  const receitaLitro = receitaMensal !== null && producaoDia ? receitaMensal / (producaoDia * 30) : null;
  return {
    litrosVacaDia: num(l?.litros_vaca_dia),
    producaoDia,
    vacasLactacao: num(l?.vacas_lactacao),
    receitaMensal,
    despesaMensal: num(l?.despesa_mensal),
    custoLitro,
    receitaLitro,
    sobraLitro: receitaLitro !== null && custoLitro !== null ? receitaLitro - custoLitro : null,
  };
}

export async function carregarIndicadoresFazenda(propriedadeId: string): Promise<IndicadoresFazenda> {
  const supabase = createServiceClient();
  const [{ data: hoje }, { data: adesao }, { data: programa }] = await Promise.all([
    supabase.rpc("calcular_indicadores", { p_propriedade_id: propriedadeId, p_data: hojeBrasil() }).maybeSingle(),
    supabase.from("adesoes_programa").select("*").eq("propriedade_id", propriedadeId).maybeSingle(),
    supabase.from("indicadores_reprodutivos_programa").select("*").eq("propriedade_id", propriedadeId).maybeSingle(),
  ]);

  const p = programa as Linha | null;
  return {
    hoje: montar(hoje as Linha | null),
    adesao: adesao ? { ...montar(adesao as Linha), data: String((adesao as Linha).data_adesao) } : null,
    programa: p
      ? {
          taxaConcepcao: num(p.taxa_concepcao),
          dosesPorPrenhez: num(p.doses_por_prenhez),
          dosesUsadas: Number(p.doses_usadas ?? 0),
          gestacoesEmCurso: Number(p.gestacoes_em_curso ?? 0),
          nascimentos: Number(p.nascimentos ?? 0),
          femeas: Number(p.femeas ?? 0),
        }
      : null,
  };
}
