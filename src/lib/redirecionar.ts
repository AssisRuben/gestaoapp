import { NextResponse } from "next/server";

// Redirecionamento com caminho RELATIVO (Location: /login). Atrás do túnel/proxy o servidor se vê
// como localhost:3000, então `new URL(path, request.url)` mandava o usuário pra
// https://localhost:3000/... — quebrava o login com Google e os links dos e-mails. Com caminho
// relativo o navegador continua no domínio em que já está (produção ou homologação).
export function redirecionar(caminho: string) {
  return new NextResponse(null, { status: 307, headers: { Location: caminho } });
}

// Só destino interno: "/algo", nunca "//outro-site" nem "https://..." (senão um link de e-mail
// montado por terceiros poderia mandar o usuário pra fora depois do login).
export function destinoInterno(next: string | null, padrao = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return padrao;
  return next;
}
