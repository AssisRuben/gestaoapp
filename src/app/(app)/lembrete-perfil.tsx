"use client";

// Lembrete no Início enquanto o perfil da fazenda (0053) estiver incompleto. O botão abre o modal da
// fazenda (FazendaTrigger, no cabeçalho) já na seção do perfil.
export function LembretePerfil({ faltam }: { faltam: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-base font-semibold text-black dark:text-zinc-50">Complete o perfil da fazenda</span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {faltam === 1 ? "Falta 1 resposta" : `Faltam ${faltam} respostas`} (área, irrigação, raça, ordenha...). Elas
          entram nos relatórios da fazenda.
        </span>
      </div>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event("gestaopec:abrir-perfil"))}
        className="shrink-0 self-start rounded-full bg-brand-green px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-green-dark sm:self-auto"
      >
        Completar perfil
      </button>
    </div>
  );
}
