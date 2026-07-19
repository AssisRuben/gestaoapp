"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, ACCENT_ACTIVE_CLASSES } from "./nav-items";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-black/[.08] bg-white px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] sm:hidden dark:border-white/[.145] dark:bg-zinc-950">
      {NAV_ITEMS.map((item) => {
        const ativo = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs font-medium transition-colors ${
              ativo ? ACCENT_ACTIVE_CLASSES[item.accent] : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="w-full truncate text-center leading-tight">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
