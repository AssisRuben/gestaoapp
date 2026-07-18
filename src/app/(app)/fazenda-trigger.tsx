"use client";

import { useState } from "react";
import { FazendaModal } from "./fazenda-modal";
import type { Propriedade } from "@/lib/propriedade";
import type { UsuarioWhatsapp, PatrimonioItem } from "./fazenda-types";

export function FazendaTrigger({
  propriedade,
  usuarioWhatsapp,
  patrimonios,
}: {
  propriedade: Propriedade;
  usuarioWhatsapp: UsuarioWhatsapp | null;
  patrimonios: PatrimonioItem[];
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="truncate text-sm font-medium text-black hover:underline dark:text-zinc-50"
      >
        {propriedade.nome_propriedade}
      </button>
      {aberto && (
        <FazendaModal
          propriedade={propriedade}
          usuarioWhatsapp={usuarioWhatsapp}
          patrimonios={patrimonios}
          onClose={() => setAberto(false)}
        />
      )}
    </>
  );
}
