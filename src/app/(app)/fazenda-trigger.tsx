"use client";

import { useState } from "react";
import Image from "next/image";
import { FazendaModal } from "./fazenda-modal";
import { getFazendaData } from "./fazenda-actions";
import { PropriedadeSelect } from "./propriedade-select";
import type { Propriedade, VinculoPropriedade } from "@/lib/propriedade";
import type { UsuarioWhatsapp, PatrimonioItem } from "./fazenda-types";

export function FazendaTrigger({
  propriedade,
  vinculos,
}: {
  propriedade: Propriedade;
  vinculos: VinculoPropriedade[];
}) {
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
      <button type="button" onClick={abrir} className="shrink-0">
        <Image
          src="/gestao-pec-logo.png"
          alt="Gestão Pec"
          width={776}
          height={768}
          sizes="80px"
          className="h-16 w-auto sm:h-20"
        />
      </button>

      <div className="flex min-w-0 flex-col items-center justify-center gap-1">
        <button
          type="button"
          onClick={abrir}
          className="max-w-full truncate text-lg font-bold text-black hover:underline sm:text-2xl lg:text-3xl dark:text-zinc-50"
        >
          {propriedade.nome_propriedade}
        </button>
        {vinculos.length > 1 && <PropriedadeSelect vinculos={vinculos} atualId={propriedade.id} />}
      </div>

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
