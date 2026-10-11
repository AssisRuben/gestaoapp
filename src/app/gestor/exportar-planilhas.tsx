// Botões de download das planilhas do gestor (rota /gestor/exportar/[planilha]). Arquivos .csv que
// o Excel em português abre direto.

const PLANILHAS: { id: string; titulo: string; descricao: string }[] = [
  { id: "fazendas", titulo: "Fazendas", descricao: "Uma linha por fazenda: rebanho, produção, custo/litro, IEP, últimos lançamentos" },
  { id: "leite", titulo: "Leite por dia", descricao: "Litros de cada fazenda em cada dia com pesagem" },
  { id: "financeiro", titulo: "Financeiro por mês", descricao: "Receitas, despesas e saldo de cada fazenda por mês" },
  { id: "doses", titulo: "Doses do programa", descricao: "Recebidas, usadas, perdidas e saldo por fazenda e touro" },
];

export function ExportarPlanilhas() {
  return (
    <section className="mx-4 mb-6 flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-surface p-4 sm:mx-6 dark:border-white/[.145]">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-black dark:text-zinc-50">Exportar planilhas</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Abrem direto no Excel ou no Google Planilhas. Mesmos números das telas.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {PLANILHAS.map((p) => (
          <a
            key={p.id}
            href={`/gestor/exportar/${p.id}`}
            download
            className="flex flex-col gap-0.5 rounded-xl border border-black/[.08] p-3 transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-white/[.06]"
          >
            <span className="font-medium text-black dark:text-zinc-50">⬇ {p.titulo}</span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{p.descricao}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
