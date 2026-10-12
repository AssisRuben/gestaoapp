"use client";

import { useState } from "react";

// Campo de senha com o olho pra mostrar/esconder o que foi digitado (cadastro, login e nova senha).
export function CampoSenha({
  id,
  name,
  className,
  autoComplete = "new-password",
  minLength = 8,
}: {
  id: string;
  name: string;
  className?: string;
  autoComplete?: string;
  minLength?: number;
}) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        name={name}
        type={visivel ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        className={`w-full pr-12 ${className ?? ""}`}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Esconder a senha" : "Mostrar a senha"}
        aria-pressed={visivel}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-zinc-500 hover:text-black dark:hover:text-zinc-50"
      >
        {visivel ? (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <path d="M1 1l22 22" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
