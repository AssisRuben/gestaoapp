import { GestorDashboardClient } from "./gestor-dashboard-client";

// Dados fictícios estáticos só pra desenhar a tela — nenhuma chamada ao Supabase aqui ainda (mesmo
// padrão das outras abas do gestor: ranking, alertas e agente). Usa as mesmas 8 fazendas fictícias
// da aba de Ranking pra manter a narrativa consistente entre as abas. Os litros/saldo já vêm
// distribuídos em datas de julho/2026 pra bater com o filtro "De/Até" padrão (mês corrente).

const FAZENDAS = [
  {
    id: "1",
    nome_propriedade: "Fazenda Boa Vista",
    latitude: -4.9707,
    longitude: -39.0158,
    vacasTotal: 42,
    vacasEmLactacao: 30,
    totalAnimais: 58,
  },
  {
    id: "2",
    nome_propriedade: "Sítio Três Irmãos",
    latitude: -3.688,
    longitude: -40.3489,
    vacasTotal: 35,
    vacasEmLactacao: 24,
    totalAnimais: 47,
  },
  {
    id: "3",
    nome_propriedade: "Fazenda Recanto Verde",
    latitude: -6.3596,
    longitude: -39.2985,
    vacasTotal: 33,
    vacasEmLactacao: 23,
    totalAnimais: 44,
  },
  {
    id: "4",
    nome_propriedade: "Fazenda Água Fria",
    latitude: -7.2342,
    longitude: -39.4097,
    vacasTotal: 30,
    vacasEmLactacao: 20,
    totalAnimais: 40,
  },
  {
    id: "5",
    nome_propriedade: "Sítio Nova Esperança",
    latitude: -6.0,
    longitude: -40.2958,
    vacasTotal: 27,
    vacasEmLactacao: 18,
    totalAnimais: 36,
  },
  {
    id: "6",
    nome_propriedade: "Fazenda Santa Luzia",
    latitude: -4.359,
    longitude: -39.3117,
    vacasTotal: 24,
    vacasEmLactacao: 16,
    totalAnimais: 32,
  },
  {
    id: "7",
    nome_propriedade: "Fazenda Vale do Sol",
    latitude: -3.4942,
    longitude: -39.5786,
    vacasTotal: 21,
    vacasEmLactacao: 14,
    totalAnimais: 28,
  },
  {
    id: "8",
    nome_propriedade: "Fazenda Serra Bonita",
    latitude: -4.3283,
    longitude: -38.8817,
    vacasTotal: 18,
    vacasEmLactacao: 12,
    totalAnimais: 24,
  },
];

// Litros do mês corrente (julho/2026), espalhados em 5 datas por fazenda.
const REGISTROS_LEITE = [
  { propriedade_id: "1", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [2400, 2350, 2400, 2350, 2300] },
  { propriedade_id: "2", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [1980, 1950, 1970, 1960, 1940] },
  { propriedade_id: "3", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [1820, 1830, 1810, 1820, 1820] },
  { propriedade_id: "4", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [1650, 1660, 1650, 1640, 1650] },
  { propriedade_id: "5", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [1510, 1500, 1520, 1510, 1510] },
  { propriedade_id: "6", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [1360, 1370, 1360, 1350, 1360] },
  { propriedade_id: "7", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [1190, 1190, 1190, 1190, 1190] },
  { propriedade_id: "8", datas: ["2026-07-02", "2026-07-06", "2026-07-10", "2026-07-14", "2026-07-18"], litros: [980, 980, 980, 980, 980] },
].flatMap((f) =>
  f.datas.map((data_controle, i) => ({
    propriedade_id: f.propriedade_id,
    litros: f.litros[i],
    data_controle,
  })),
);

// Financeiro do mês corrente: uma receita e uma despesa por fazenda, já batendo com o saldo
// esperado (receita - despesa).
const LANCAMENTOS_FINANCEIROS = [
  { propriedade_id: "1", tipo: "receita", valor: 9350, data: "2026-07-05" },
  { propriedade_id: "1", tipo: "despesa", valor: 4000, data: "2026-07-12" },
  { propriedade_id: "2", tipo: "receita", valor: 4200, data: "2026-07-05" },
  { propriedade_id: "2", tipo: "despesa", valor: 2200, data: "2026-07-12" },
  { propriedade_id: "3", tipo: "receita", valor: 7500, data: "2026-07-05" },
  { propriedade_id: "3", tipo: "despesa", valor: 3200, data: "2026-07-12" },
  { propriedade_id: "4", tipo: "receita", valor: 6100, data: "2026-07-05" },
  { propriedade_id: "4", tipo: "despesa", valor: 2800, data: "2026-07-12" },
  { propriedade_id: "5", tipo: "receita", valor: 4500, data: "2026-07-05" },
  { propriedade_id: "5", tipo: "despesa", valor: 2000, data: "2026-07-12" },
  { propriedade_id: "6", tipo: "receita", valor: 3800, data: "2026-07-05" },
  { propriedade_id: "6", tipo: "despesa", valor: 1800, data: "2026-07-12" },
  { propriedade_id: "7", tipo: "receita", valor: 3850, data: "2026-07-05" },
  { propriedade_id: "7", tipo: "despesa", valor: 1600, data: "2026-07-12" },
  { propriedade_id: "8", tipo: "receita", valor: 2800, data: "2026-07-05" },
  { propriedade_id: "8", tipo: "despesa", valor: 1200, data: "2026-07-12" },
];

const IEP_MEDIO = 412;

export default function GestorDashboardPage() {
  return (
    <GestorDashboardClient
      fazendas={FAZENDAS}
      registrosLeite={REGISTROS_LEITE}
      lancamentos={LANCAMENTOS_FINANCEIROS}
      iepMedio={IEP_MEDIO}
    />
  );
}
