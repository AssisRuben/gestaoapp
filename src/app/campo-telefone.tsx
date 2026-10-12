"use client";

import { useState } from "react";
import { mascaraTelefone } from "@/lib/telefone";

// Campo de WhatsApp com a máscara (85) 99999-9999 — cadastro, nova fazenda do gestor e modal da fazenda.
export function CampoTelefone({
  id,
  name,
  defaultValue = "",
  className,
  required,
}: {
  id: string;
  name: string;
  defaultValue?: string;
  className?: string;
  required?: boolean;
}) {
  const [valor, setValor] = useState(() => mascaraTelefone(defaultValue));
  return (
    <input
      id={id}
      name={name}
      type="tel"
      inputMode="tel"
      autoComplete="tel-national"
      placeholder="(85) 99999-9999"
      required={required}
      value={valor}
      onChange={(e) => setValor(mascaraTelefone(e.target.value))}
      pattern="\(\d{2}\) \d{4,5}-\d{4}"
      title="WhatsApp com DDD, por exemplo (85) 99999-9999"
      className={className}
    />
  );
}
