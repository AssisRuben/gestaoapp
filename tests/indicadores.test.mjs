// Indicadores da lactação (src/lib/indicadores.ts) — os mesmos números da ficha da vaca, do
// resumo da fazenda e (pela mesma regra em SQL, _indicadores_lactacao) dos relatórios do bot.
import { carregar, ok, terminar } from "./ts.mjs";

const ind = await carregar("indicadores");
const perto = (a, b) => Math.abs(a - b) < 1e-6;

// pesagem semanal de 20 L/dia (duas ordenhas de 10) em 100 dias de lactação
const parto = "2026-07-02";
const hoje = "2026-10-10";
const pesagens = [];
for (let d = 0; d <= 98; d += 7) {
  const data = new Date(Date.parse(parto + "T12:00:00Z") + d * 864e5).toISOString().slice(0, 10);
  pesagens.push({ data, litros: 10 }, { data, litros: 10 });
}
const r = ind.indicadoresLactacao(parto, pesagens, hoje);
ok(r.del === 100, `dias em lactação = 100 (veio ${r.del})`);
ok(perto(r.mediaDiaria, 20), `média dos dias pesados = 20, mesmo com pesagem semanal (veio ${r.mediaDiaria})`);
ok(perto(r.projecao305, 6100), `projeção 305 = 6100 (veio ${r.projecao305})`);
ok(perto(r.persistencia, 100), `persistência 100% com produção constante (veio ${r.persistencia})`);
ok(r.diasPesados === 15, `15 dias pesados (veio ${r.diasPesados})`);

const queda = pesagens.map((p) => (p.data > "2026-09-10" ? { ...p, litros: 5 } : p));
ok(perto(ind.indicadoresLactacao(parto, queda, hoje).persistencia, 50), "persistência 50% quando a produção cai pela metade");
ok(ind.indicadoresLactacao("2026-09-01", pesagens, hoje).persistencia === null, "sem persistência antes de 60 dias");

const coberturas = [
  { data_cobertura: "2026-06-01", diagnostico_prenhez: "positivo" }, // antes do parto: não conta
  { data_cobertura: "2026-08-20", diagnostico_prenhez: "negativo" },
  { data_cobertura: "2026-09-15", diagnostico_prenhez: "positivo" },
];
const daLactacao = ind.coberturasDaLactacao(coberturas, parto);
ok(daLactacao.length === 2, "só contam coberturas depois do parto atual");
const s = ind.situacaoReprodutiva(daLactacao, parto, hoje);
ok(s.tipo === "prenhe" && s.partoPrevisto === "2027-06-25" && s.secarEm === "2027-04-26", "prenhe: parto em 283 dias, secar 60 dias antes");
const aberto = ind.diasEmAberto(daLactacao, parto, hoje);
ok(aberto.dias === 75 && aberto.fechado, "dias em aberto fecham na cobertura positiva");
const contando = ind.diasEmAberto([{ data_cobertura: "2026-09-15", diagnostico_prenhez: "pendente" }], parto, hoje);
ok(contando.dias === 100 && !contando.fechado, "sem prenhez confirmada, dias em aberto continuam contando");
ok(ind.situacaoReprodutiva([{ data_cobertura: "2026-10-01", diagnostico_prenhez: "pendente" }], parto, hoje).tipo === "em_servico", "cobertura pendente = em serviço");
ok(ind.situacaoReprodutiva([], parto, hoje).tipo === "vazia", "sem cobertura = vazia");

// Cobertura atual por vaca (Início e resumo da fazenda): só a lactação atual, sem a que virou parto
const cobs = [
  { id: "c1", vaca_id: "A", data_cobertura: "2025-09-20", diagnostico_prenhez: "positivo" }, // gerou o parto ativo
  { id: "c2", vaca_id: "B", data_cobertura: "2026-03-01", diagnostico_prenhez: "positivo" }, // antes do parto ativo, solta
  { id: "c3", vaca_id: "C", data_cobertura: "2026-07-23", diagnostico_prenhez: "pendente" }, // pendente antiga
  { id: "c4", vaca_id: "C", data_cobertura: "2026-07-24", diagnostico_prenhez: "pendente" }, // a que vale
  { id: "c5", vaca_id: "D", data_cobertura: "2026-05-01", diagnostico_prenhez: "positivo" }, // novilha: sem parto
];
const partosAtivos = [
  { vaca_id: "A", data_parto: "2026-07-01", ativa: true, cobertura_id: "c1" },
  { vaca_id: "B", data_parto: "2026-07-23", ativa: true, cobertura_id: null },
  { vaca_id: "C", data_parto: "2026-06-01", ativa: true, cobertura_id: null },
];
const atual = ind.coberturaAtualPorVaca(cobs, partosAtivos);
ok(!atual.has("A"), "cobertura que já virou parto não conta (vaca não aparece pra secar de novo)");
ok(!atual.has("B"), "positiva de antes do parto ativo não conta");
ok(atual.get("C")?.id === "c4" && atual.size === 2, "só a cobertura mais recente de cada vaca (sem pendente repetida)");
ok(atual.get("D")?.id === "c5", "vaca sem parto: vale a cobertura mais recente");

terminar("indicadores");
