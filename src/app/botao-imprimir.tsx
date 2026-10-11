"use client";

export function BotaoImprimir({ rotulo = "Imprimir / salvar PDF" }: { rotulo?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark print:hidden"
    >
      {rotulo}
    </button>
  );
}
