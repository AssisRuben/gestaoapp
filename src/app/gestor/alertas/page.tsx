import { getResumoFazendasCache, getFinanceiroDiarioTodasCache } from "@/lib/cached-data";
import { normalizarResumo, normalizarFinanceiro, hojeBrasil, diasEntre } from "@/lib/gestor";
import {
  AlertasClient,
  type AlertaMargem,
  type AlertaSemLancamento,
  type NivelAlerta,
} from "./alertas-client";

// Regras dos alertas (dados reais, 0020_gestor_dados_reais.sql):
//   - Queda de margem: saldo do último mês FECHADO pelo menos 20% abaixo do mês anterior (crítico
//     a partir de 40%). Mês corrente fica de fora — no começo do mês todo mundo "cairia". Só
//     compara quando o mês anterior teve saldo positivo (variação sobre base negativa não diz nada).
//   - Sem lançamento de leite: mais de 7 dias (crítico acima de 14 ou nunca lançou), só pra
//     fazenda com vaca em lactação.
//   - Sem lançamento financeiro: mesmos prazos, todas as fazendas.
const LIMITE_QUEDA = 0.2;
const LIMITE_QUEDA_CRITICA = 0.4;
const DIAS_ATENCAO = 7;
const DIAS_CRITICO = 14;

const NOMES_MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesAnterior(mes: string) {
  const ano = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

const rotuloMes = (mes: string) => `${NOMES_MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

function nivelPorDias(dias: number | null): NivelAlerta {
  return dias === null || dias > DIAS_CRITICO ? "critico" : "atencao";
}

export default async function GestorAlertasPage() {
  const [resumoData, financeiroData] = await Promise.all([
    getResumoFazendasCache(),
    getFinanceiroDiarioTodasCache(),
  ]);

  const hoje = hojeBrasil();
  const mesAtual = mesAnterior(hoje.slice(0, 7));
  const mesBase = mesAnterior(mesAtual);
  const resumo = normalizarResumo(resumoData).sort((a, b) =>
    a.nome_propriedade.localeCompare(b.nome_propriedade, "pt-BR"),
  );

  const saldo = new Map<string, number>(); // chave: propriedade|mês
  for (const f of normalizarFinanceiro(financeiroData)) {
    const mes = f.data.slice(0, 7);
    if (mes !== mesAtual && mes !== mesBase) continue;
    const chave = `${f.propriedade_id}|${mes}`;
    saldo.set(chave, (saldo.get(chave) ?? 0) + f.receita - f.despesa);
  }

  const quedaMargem: AlertaMargem[] = [];
  for (const r of resumo) {
    const anterior = saldo.get(`${r.propriedade_id}|${mesBase}`);
    if (anterior === undefined || anterior <= 0) continue;
    const atual = saldo.get(`${r.propriedade_id}|${mesAtual}`) ?? 0;
    const queda = (anterior - atual) / anterior;
    if (queda < LIMITE_QUEDA) continue;
    quedaMargem.push({
      id: r.propriedade_id,
      nome: r.nome_propriedade,
      telefone: r.telefone,
      saldoAnterior: anterior,
      saldoAtual: atual,
      nivel: queda >= LIMITE_QUEDA_CRITICA ? "critico" : "atencao",
    });
  }
  quedaMargem.sort((a, b) => a.saldoAtual / a.saldoAnterior - b.saldoAtual / b.saldoAnterior);

  type Fazenda = (typeof resumo)[number];
  const semLancamento = (ultimo: (r: Fazenda) => string | null, filtro?: (r: Fazenda) => boolean) =>
    resumo
      .filter((r) => !filtro || filtro(r))
      .map((r): AlertaSemLancamento => {
        const data = ultimo(r);
        const dias = data ? diasEntre(data, hoje) : null;
        return { id: r.propriedade_id, nome: r.nome_propriedade, telefone: r.telefone, dias, nivel: nivelPorDias(dias) };
      })
      .filter((a) => a.dias === null || a.dias > DIAS_ATENCAO)
      // nunca lançou primeiro, depois quem está há mais tempo sem lançar
      .sort((a, b) => (b.dias ?? Infinity) - (a.dias ?? Infinity));

  return (
    <AlertasClient
      quedaMargem={quedaMargem}
      semLancamentoLeite={semLancamento((r) => r.ultimo_leite, (r) => r.vacas_lactacao > 0)}
      semLancamentoFinanceiro={semLancamento((r) => r.ultimo_financeiro)}
      rotuloMeses={`${rotuloMes(mesAtual)} vs. ${rotuloMes(mesBase)}`}
    />
  );
}
