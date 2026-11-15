"use client";

import { useSyncExternalStore, type FocusEvent } from "react";

// Área da tela que sobra acima do teclado do celular. No Android/iOS o teclado cobre a página sem
// diminuir o "vh": um modal com max-h-[90vh] ficava com os últimos campos e os botões embaixo do
// teclado, sem ter como rolar até eles. Com isto, o modal ocupa só a parte visível.
function assinar(avisar: () => void) {
  const v = window.visualViewport;
  if (!v) return () => {};
  v.addEventListener("resize", avisar);
  v.addEventListener("scroll", avisar);
  return () => {
    v.removeEventListener("resize", avisar);
    v.removeEventListener("scroll", avisar);
  };
}

// texto "altura|topo" (o snapshot precisa ser um valor simples, senão o React re-renderiza à toa)
function ler() {
  const v = window.visualViewport;
  return v ? `${v.height}|${v.offsetTop}` : "";
}

export function useViewportVisivel(): { top: number; height: number; bottom: "auto" } | undefined {
  const valor = useSyncExternalStore(assinar, ler, () => "");
  if (!valor) return undefined;
  const [altura, topo] = valor.split("|").map(Number);
  return { top: topo, height: altura, bottom: "auto" };
}

// Ao tocar num campo, espera o teclado abrir e rola o campo pro meio da parte visível.
export function rolarCampoParaVisivel(e: FocusEvent<HTMLElement>) {
  const alvo = e.target;
  if (!(alvo instanceof HTMLInputElement || alvo instanceof HTMLSelectElement || alvo instanceof HTMLTextAreaElement)) return;
  setTimeout(() => alvo.scrollIntoView({ block: "center", behavior: "smooth" }), 300);
}
