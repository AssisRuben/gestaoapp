const CORES_STROKE = [
  "stroke-financeiro",
  "stroke-vacas",
  "stroke-leite",
  "stroke-reproducao",
  "stroke-bezerros",
  "stroke-brand-green",
];
const CORES_BG = [
  "bg-financeiro",
  "bg-vacas",
  "bg-leite",
  "bg-reproducao",
  "bg-bezerros",
  "bg-brand-green",
];

const CATEGORIA_LABEL: Record<string, string> = {
  racao: "Ração",
  veterinario: "Veterinário",
  combustivel: "Combustível",
  "mao de obra": "Mão de obra",
  manutencao: "Manutenção",
  insumos: "Insumos",
  outros: "Outros",
};

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

const R = 60;
const STROKE = 24;
const CIRC = 2 * Math.PI * R;

export function DespesasPizzaChart({
  despesas,
}: {
  despesas: { categoria: string | null; valor: number }[];
}) {
  const porCategoria = new Map<string, number>();
  for (const d of despesas) {
    const chave = d.categoria ?? "outros";
    porCategoria.set(chave, (porCategoria.get(chave) ?? 0) + Number(d.valor));
  }
  const itens = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const total = itens.reduce((soma, [, v]) => soma + v, 0);

  let acumulado = 0;

  return (
    <div className="rounded-2xl border bg-surface border-black/[.08] p-4 dark:border-white/[.145]">
      <p className="mb-3 flex items-center gap-2 text-base font-semibold text-black dark:text-zinc-50">
        <span className="h-2.5 w-2.5 rounded-full bg-financeiro" aria-hidden="true" />
        Despesas por categoria
      </p>

      {total === 0 ? (
        <p className="py-10 text-center text-sm text-zinc-600 dark:text-zinc-400">
          Nenhuma despesa nesse período.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <svg viewBox="0 0 140 140" className="h-40 w-40 shrink-0 -rotate-90">
            {itens.map(([categoria, valor], i) => {
              const comprimento = (valor / total) * CIRC;
              const offset = -acumulado;
              acumulado += comprimento;
              return (
                <circle
                  key={categoria}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  strokeWidth={STROKE}
                  strokeDasharray={`${comprimento} ${CIRC - comprimento}`}
                  strokeDashoffset={offset}
                  className={CORES_STROKE[i % CORES_STROKE.length]}
                />
              );
            })}
          </svg>

          <ul className="flex w-full flex-col gap-2">
            {itens.map(([categoria, valor], i) => (
              <li key={categoria} className="flex items-center justify-between gap-2 text-base">
                <span className="flex items-center gap-2 text-black dark:text-zinc-50">
                  <span
                    className={`h-2.5 w-2.5 shrink-0 rounded-full ${CORES_BG[i % CORES_BG.length]}`}
                    aria-hidden="true"
                  />
                  {CATEGORIA_LABEL[categoria] ?? categoria}
                </span>
                <span className="flex shrink-0 items-center gap-2 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  {formatarMoeda(valor)}
                  <span className="text-sm">({Math.round((valor / total) * 100)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
