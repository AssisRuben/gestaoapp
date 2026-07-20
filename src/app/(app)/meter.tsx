export function Meter({
  label,
  pct,
  detalhe,
  corClass,
  fundoClass,
}: {
  label: string;
  pct: number;
  detalhe?: string;
  corClass: string;
  fundoClass: string;
}) {
  const pctClamp = Math.min(Math.max(Math.round(pct), 0), 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-base">
        <span className="font-medium text-black dark:text-zinc-50">{label}</span>
        <span className="shrink-0 font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
          {detalhe && <>{detalhe} </>}
          <span className="font-semibold text-black dark:text-zinc-50">({pctClamp}%)</span>
        </span>
      </div>
      <div className={`h-3 w-full overflow-hidden rounded-full ${fundoClass}`}>
        <div
          className={`h-full rounded-full ${corClass}`}
          style={{ width: `${pctClamp}%` }}
        />
      </div>
    </div>
  );
}
