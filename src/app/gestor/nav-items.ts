import type { NavItem } from "../(app)/nav-items";
import { HomeIcon, TrophyIcon, AlertIcon, ChatIcon, StrawIcon, PeopleIcon } from "../(app)/nav-icons";

// Abas do painel do gestor. Todas leem dados reais (agregados em 0020_gestor_dados_reais.sql;
// a aba Programa usa 0018/0019, a aba Técnicos usa 0023).
export const GESTOR_NAV_ITEMS: NavItem[] = [
  { href: "/gestor", label: "Visão Geral", icon: HomeIcon, accent: "inicio" },
  { href: "/gestor/ranking", label: "Ranking", icon: TrophyIcon, accent: "ranking" },
  { href: "/gestor/programa", label: "Programa", icon: StrawIcon, accent: "reproducao" },
  { href: "/gestor/tecnicos", label: "Técnicos", icon: PeopleIcon, accent: "vacas" },
  { href: "/gestor/alertas", label: "Alertas", icon: AlertIcon, accent: "alerta" },
  { href: "/gestor/agente", label: "Agente", icon: ChatIcon, accent: "agente" },
];
