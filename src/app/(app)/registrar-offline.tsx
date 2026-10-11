"use client";

import { useEffect } from "react";

const CHAVE_ULTIMO = "gestaopec:precarregado-em";
const INTERVALO_MS = 10 * 60 * 1000;

// Liga o service worker (public/sw.js) e, com internet, guarda a pesagem do dia no celular — no
// máximo a cada 10 minutos, pra não buscar a tela de novo a cada página aberta.
export function RegistrarOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => navigator.serviceWorker.ready)
      .then((registro) => {
        if (!navigator.onLine) return;
        let ultimo = 0;
        try {
          ultimo = Number(localStorage.getItem(CHAVE_ULTIMO) ?? 0);
        } catch {}
        if (Date.now() - ultimo < INTERVALO_MS) return;
        registro.active?.postMessage({ tipo: "precarregar" });
        try {
          localStorage.setItem(CHAVE_ULTIMO, String(Date.now()));
        } catch {}
      })
      .catch(() => {});
  }, []);

  return null;
}

// Tela de login: apaga as telas guardadas (têm dados da fazenda de quem saiu).
export function LimparOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.getRegistration().then((registro) => {
      registro?.active?.postMessage({ tipo: "limpar" });
    });
    try {
      localStorage.removeItem(CHAVE_ULTIMO);
    } catch {}
  }, []);

  return null;
}
