"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, ACCENT_ACTIVE_CLASSES, hrefAtivo, type NavItem } from "./nav-items";

// Barra de baixo do celular. Com `principais`, mostra só essas N abas e um "Mais" que abre as
// outras (o painel do gestor tem 7 abas, que não cabem numa linha no celular).
export function BottomNav({ items = NAV_ITEMS, principais }: { items?: NavItem[]; principais?: number }) {
  const pathname = usePathname();
  const [maisAberto, setMaisAberto] = useState(false);

  if (items.length === 0) return null;
  const ativoHref = hrefAtivo(items, pathname);
  const visiveis = principais && items.length > principais + 1 ? items.slice(0, principais) : items;
  const extras = items.slice(visiveis.length);
  const extraAtivo = extras.some((i) => i.href === ativoHref);

  const classeItem = (ativo: boolean, accent: string) =>
    `flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-xs font-medium transition-colors ${
      ativo ? ACCENT_ACTIVE_CLASSES[accent] : "text-zinc-600 dark:text-zinc-400"
    }`;

  return (
    <>
      {maisAberto && extras.length > 0 && (
        <div className="fixed inset-0 z-40 sm:hidden print:hidden" onClick={() => setMaisAberto(false)}>
          <div
            className="absolute inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex flex-col gap-1 rounded-2xl border border-black/[.08] bg-white p-2 shadow-lg dark:border-white/[.145] dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            {extras.map((item) => {
              const Icon = item.icon;
              const ativo = item.href === ativoHref;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMaisAberto(false)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-base font-medium ${
                    ativo ? ACCENT_ACTIVE_CLASSES[item.accent] : "text-black dark:text-zinc-50"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 bottom-0 z-40 flex gap-1 print:hidden border-t border-black/[.08] bg-white px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] sm:hidden dark:border-white/[.145] dark:bg-zinc-950">
        {visiveis.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className={classeItem(item.href === ativoHref, item.accent)}>
              <Icon className="h-5 w-5" />
              <span className="w-full truncate text-center leading-tight">{item.label}</span>
            </Link>
          );
        })}
        {extras.length > 0 && (
          <button
            type="button"
            onClick={() => setMaisAberto((v) => !v)}
            aria-expanded={maisAberto}
            className={classeItem(extraAtivo || maisAberto, "inicio")}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <circle cx="5" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="19" cy="12" r="1.8" />
            </svg>
            <span className="w-full truncate text-center leading-tight">Mais</span>
          </button>
        )}
      </nav>
    </>
  );
}
