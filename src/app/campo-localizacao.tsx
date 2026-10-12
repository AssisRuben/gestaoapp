"use client";

import { useState } from "react";

// Localização da fazenda: "Usar minha localização" pega o ponto do celular (GPS) e o link "Ver no
// mapa" abre o Google Maps pra pessoa conferir. Grava latitude/longitude nos campos de mesmo nome
// (cadastro, cadastro pela conta Google e modal da fazenda); o gestor vê a fazenda no mapa.
const casas = (v: number) => v.toFixed(6);

export function CampoLocalizacao({
  latitudeInicial,
  longitudeInicial,
  classeCampo,
  mostrarCampos = false,
}: {
  latitudeInicial?: number | null;
  longitudeInicial?: number | null;
  classeCampo?: string;
  mostrarCampos?: boolean; // modal da fazenda: deixa digitar à mão também
}) {
  const [lat, setLat] = useState(latitudeInicial != null ? String(latitudeInicial) : "");
  const [lng, setLng] = useState(longitudeInicial != null ? String(longitudeInicial) : "");
  const [estado, setEstado] = useState<{ tipo: "ok" | "erro" | "buscando"; texto: string } | null>(null);

  function usarLocalizacao() {
    if (!("geolocation" in navigator)) {
      setEstado({ tipo: "erro", texto: "Este aparelho não informa a localização." });
      return;
    }
    setEstado({ tipo: "buscando", texto: "Procurando a sua localização…" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(casas(pos.coords.latitude));
        setLng(casas(pos.coords.longitude));
        const precisao = Math.round(pos.coords.accuracy);
        setEstado({
          tipo: "ok",
          texto:
            precisao > 500
              ? `Localização marcada, mas com pouca precisão (cerca de ${precisao} m). No celular, com o GPS ligado, fica melhor.`
              : `Localização marcada (precisão de cerca de ${precisao} m). Confira no mapa.`,
        });
      },
      (erro) =>
        setEstado({
          tipo: "erro",
          texto:
            erro.code === erro.PERMISSION_DENIED
              ? "Sem permissão pra ver a localização. Libere a localização pro site no navegador e tente de novo."
              : "Não consegui pegar a localização agora. Tente de novo ao ar livre, com o GPS ligado.",
        }),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  }

  const temPonto = lat.trim() !== "" && lng.trim() !== "" && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={usarLocalizacao}
          disabled={estado?.tipo === "buscando"}
          className="rounded-full border border-black/[.08] px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          📍 Usar minha localização
        </button>
        {temPonto && (
          <a
            href={`https://www.google.com/maps?q=${lat},${lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-brand-green hover:underline"
          >
            Ver no mapa
          </a>
        )}
      </div>
      {estado && (
        <p
          className={`text-sm ${
            estado.tipo === "erro" ? "text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400"
          }`}
        >
          {estado.texto}
        </p>
      )}
      {mostrarCampos ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            Latitude
            <input
              id="latitude"
              name="latitude"
              type="number"
              step="any"
              placeholder="ex.: -5.1234"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className={classeCampo}
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
            Longitude
            <input
              id="longitude"
              name="longitude"
              type="number"
              step="any"
              placeholder="ex.: -39.1234"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              className={classeCampo}
            />
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="latitude" value={lat} />
          <input type="hidden" name="longitude" value={lng} />
        </>
      )}
    </div>
  );
}
