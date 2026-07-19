"use client";

import { useState } from "react";
import { FazendaModal } from "./fazenda-modal";
import { getFazendaData } from "./fazenda-actions";
import type { Propriedade } from "@/lib/propriedade";
import type { UsuarioWhatsapp, PatrimonioItem } from "./fazenda-types";

export function FazendaTrigger({ propriedade }: { propriedade: Propriedade }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [dados, setDados] = useState<{
    usuarioWhatsapp: UsuarioWhatsapp | null;
    patrimonios: PatrimonioItem[];
  } | null>(null);

  async function abrir() {
    setAberto(true);
    if (dados) return;
    setCarregando(true);
    const data = await getFazendaData();
    setDados(data);
    setCarregando(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="max-w-full truncate text-lg font-semibold text-black hover:underline sm:text-xl dark:text-zinc-50"
      >
        {propriedade.nome_propriedade}
      </button>
      {aberto && !carregando && dados && (
        <FazendaModal
          propriedade={propriedade}
          usuarioWhatsapp={dados.usuarioWhatsapp}
          patrimonios={dados.patrimonios}
          onClose={() => setAberto(false)}
        />
      )}
    </>
  );
}
