import { HomeIcon, MilkIcon, CycleIcon, TagIcon, PawIcon, MoneyIcon } from "./nav-icons";

export type NavItem = {
  href: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  accent: string;
};

// accent = nome do módulo, usado pra montar as classes bg-{accent}-tint /
// text-{accent}-ink definidas em globals.css. "inicio" usa o verde da marca.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Início", icon: HomeIcon, accent: "inicio" },
  { href: "/leite", label: "Leite", icon: MilkIcon, accent: "leite" },
  { href: "/reproducao", label: "Reprodução", icon: CycleIcon, accent: "reproducao" },
  { href: "/vacas", label: "Vacas", icon: TagIcon, accent: "vacas" },
  { href: "/bezerros", label: "Bezerros", icon: PawIcon, accent: "bezerros" },
  { href: "/financeiro", label: "Financeiro", icon: MoneyIcon, accent: "financeiro" },
];

export const ACCENT_ACTIVE_CLASSES: Record<string, string> = {
  inicio: "bg-brand-green/10 text-brand-green",
  leite: "bg-leite-tint text-leite-ink",
  reproducao: "bg-reproducao-tint text-reproducao-ink",
  vacas: "bg-vacas-tint text-vacas-ink",
  bezerros: "bg-bezerros-tint text-bezerros-ink",
  financeiro: "bg-financeiro-tint text-financeiro-ink",
};
