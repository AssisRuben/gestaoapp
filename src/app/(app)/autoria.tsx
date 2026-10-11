// Linha "Lançado por ... / alterado por ..." nos formulários de edição (colunas de 0030).

export type CamposAutoria = {
  created_at?: string;
  criado_por?: string | null;
  criado_via?: string | null;
  atualizado_por?: string | null;
  atualizado_em?: string | null;
};

const quando = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Fortaleza",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function nomeDe(id: string | null | undefined, nomes: Record<string, string>) {
  if (!id) return null;
  return nomes[id] ?? "um usuário sem acesso atual";
}

export function Autoria({ registro, nomes }: { registro: CamposAutoria; nomes: Record<string, string> }) {
  if (!registro.created_at) return null;

  const criado = nomeDe(registro.criado_por, nomes);
  const origem =
    registro.criado_via === "whatsapp"
      ? "pelo WhatsApp"
      : criado
        ? `por ${criado}`
        : registro.criado_via === "site"
          ? "pelo site"
          : "";
  const alterado = nomeDe(registro.atualizado_por, nomes);

  return (
    <p className="text-xs text-zinc-600 dark:text-zinc-400">
      Lançado {origem} em {quando.format(new Date(registro.created_at)).replace(",", "")}
      {registro.atualizado_em && (
        <>
          {" · alterado "}
          {alterado ? `por ${alterado}` : "pelo WhatsApp"} em{" "}
          {quando.format(new Date(registro.atualizado_em)).replace(",", "")}
        </>
      )}
    </p>
  );
}
