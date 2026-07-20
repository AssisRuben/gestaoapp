import type { NavItem } from "../(app)/nav-items";
import { HomeIcon, TrophyIcon, AlertIcon, ChatIcon } from "../(app)/nav-icons";

// Fase 2: abas do painel do gestor. "Ranking", "Alertas" e "Agente" ainda usam dados fictícios
// estáticos (ver comentário no topo de cada page.tsx) — a ligação com o Supabase vem depois.
export const GESTOR_NAV_ITEMS: NavItem[] = [
  { href: "/gestor", label: "Visão Geral", icon: HomeIcon, accent: "inicio" },
  { href: "/gestor/ranking", label: "Ranking", icon: TrophyIcon, accent: "ranking" },
  { href: "/gestor/alertas", label: "Alertas", icon: AlertIcon, accent: "alerta" },
  { href: "/gestor/agente", label: "Agente", icon: ChatIcon, accent: "agente" },
];
