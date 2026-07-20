export function BarRanking({
  itens,
  corClass,
  fundoClass,
  showRank = false,
  media,
}: {
  itens: { id: string; label: string; valor: number; formatado: string; destaque?: string }[];
  corClass: string;
  fundoClass: string;
  showRank?: boolean;
  media?: { label: string; valor: number; formatado: string };
}) {
  const max = Math.max(...itens.map((i) => Math.abs(i.valor)), media ? Math.abs(media.valor) : 0, 1);

  return (
    <ul className="flex flex-col gap-3">
      {itens.map((item, i) => (
        <li key={item.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-2 text-base">
            <span className="flex min-w-0 items-center gap-2 text-black dark:text-zinc-50">
              {showRank && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/[.06] text-xs font-semibold text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                  {i + 1}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2 font-mono tabular-nums text-black dark:text-zinc-50">
              {item.destaque && (
                <span className="text-sm font-normal text-zinc-600 dark:text-zinc-400">
                  {item.destaque}
                </span>
              )}
              {item.formatado}
            </span>
          </div>
          <div className={`h-2 w-full overflow-hidden rounded-full ${fundoClass}`}>
            <div
              className={`h-full rounded-full ${corClass}`}
              style={{ width: `${Math.max((Math.abs(item.valor) / max) * 100, 4)}%` }}
            />
          </div>
        </li>
      ))}
      {itens.length === 0 && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum dado no período.</p>
      )}
      {media && (
        <li className="mt-1 flex flex-col gap-1 border-t border-dashed border-black/[.12] pt-3 dark:border-white/[.2]">
          <div className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400">
              <span className="h-2 w-2 rounded-full bg-zinc-400 dark:bg-zinc-500" aria-hidden="true" />
              {media.label}
            </span>
            <span className="font-mono tabular-nums text-zinc-600 dark:text-zinc-400">{media.formatado}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-black/[.06] dark:bg-white/[.1]">
            <div
              className="h-full rounded-full bg-zinc-400 dark:bg-zinc-500"
              style={{ width: `${Math.max((Math.abs(media.valor) / max) * 100, 4)}%` }}
            />
          </div>
        </li>
      )}
    </ul>
  );
}
