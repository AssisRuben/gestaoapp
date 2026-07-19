export function MobileCardList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-2 sm:hidden">{children}</div>;
}

export function MobileCard({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-2xl border bg-surface border-black/[.08] p-3 dark:border-white/[.145] ${
        onClick ? "cursor-pointer active:bg-black/[.04] dark:active:bg-white/[.06]" : ""
      }`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  badge,
  accentClassName,
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  /** Classe de cor (ex.: "bg-vacas") pro pontinho de identidade do módulo antes do título. */
  accentClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 font-medium text-black dark:text-zinc-50">
        {accentClassName && (
          <span className={`h-2 w-2 shrink-0 rounded-full ${accentClassName}`} aria-hidden="true" />
        )}
        {title}
      </span>
      {badge}
    </div>
  );
}

export function CardRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-base">
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className={valueClassName ?? "text-black dark:text-zinc-50"}>{value}</span>
    </div>
  );
}

export function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-2xl border bg-surface border-black/[.08] p-4 text-center text-sm text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
      {children}
    </p>
  );
}
