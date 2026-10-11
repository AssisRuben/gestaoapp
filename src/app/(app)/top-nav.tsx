"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, ACCENT_ACTIVE_CLASSES, hrefAtivo, type NavItem } from "./nav-items";

export function TopNav({ items = NAV_ITEMS }: { items?: NavItem[] }) {
  const pathname = usePathname();

  if (items.length === 0) return null;
  const ativoHref = hrefAtivo(items, pathname);

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {items.map((item) => {
        const ativo = item.href === ativoHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-1.5 py-1.5 text-sm font-medium transition-colors lg:px-3 ${
              ativo
                ? ACCENT_ACTIVE_CLASSES[item.accent]
                : "text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
