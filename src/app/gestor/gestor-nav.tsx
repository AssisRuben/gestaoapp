"use client";

// Wrapper client-only: TopNav/BottomNav são client components e não aceitam receber os itens de
// nav (que incluem componentes de ícone, ou seja, funções) como prop vinda de um Server
// Component — React bloqueia função "crua" cruzando essa fronteira. Aqui o import de
// GESTOR_NAV_ITEMS acontece dentro do client boundary, então não há serialização nenhuma
// envolvida.
import { TopNav } from "../(app)/top-nav";
import { BottomNav } from "../(app)/bottom-nav";
import { GESTOR_NAV_ITEMS } from "./nav-items";

export function GestorTopNav() {
  return <TopNav items={GESTOR_NAV_ITEMS} />;
}

export function GestorBottomNav() {
  return <BottomNav items={GESTOR_NAV_ITEMS} />;
}
