import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { hojeBrasil } from "@/lib/datas";

// Índices da fazenda pro PRÓPRIO produtor (Início e relatório da visita) — os mesmos números que o
// gestor vê no ranking e na linha de base: calcular_indicadores (0019) é a régua única. Inclui os
// índices reprodutivos do programa de sêmen (0021), quando a fazenda participa (tem entrega de doses). A comparação com a
// linha de base da adesão fica só no painel do gestor. Service role: quem chama já validou o acesso à fazenda.

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
  const [{ data: hoje }, { count: entregas }, { data: programa }] = await Promise.all([
    supabase.rpc("calcular_indicadores", { p_propriedade_id: propriedadeId, p_data: hojeBrasil() }).maybeSingle(),
    supabase.from("entregas_doses").select("id", { count: "exact", head: true }).eq("propriedade_id", propriedadeId),
    supabase.from("indicadores_reprodutivos_programa").select("*").eq("propriedade_id", propriedadeId).maybeSingle(),
  ]);

  // programa de sêmen só pra fazenda que participa (já recebeu alguma entrega de doses)
  const p = entregas ? (programa as Linha | null) : null;
  return {
    hoje: montar(hoje as Linha | null),
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
