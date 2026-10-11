// Fila de pesagens guardadas no celular (localStorage) enquanto não há internet. Cada pesagem é
// enviada pra /api/pesagem quando a conexão volta; reenviar é seguro (a mesma ordenha é corrigida,
// não duplicada). Só roda no navegador.

export type PesagemGuardada = {
  id: string;
  propriedadeId: string;
  data: string;
  periodo: string;
  itens: { vaca_id: string; litros: number }[];
  guardadaEm: string;
  ultimoErro?: string;
};

export type ResultadoEnvio = {
  enviadas: number;
  restantes: number;
  erros: { vaca_id: string; numero: number | null; mensagem: string }[];
  falha?: string;
};

const CHAVE = "gestaopec:fila-pesagens";
const EVENTO = "gestaopec:fila-mudou";

function ler(): PesagemGuardada[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
  } catch {
    return [];
  }
}

function gravar(fila: PesagemGuardada[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(fila));
  } catch {
    // sem armazenamento (navegação privada): a pesagem não fica guardada
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function filaPesagens(): PesagemGuardada[] {
  return ler();
}

export function aoMudarFila(callback: () => void) {
  const handler = () => callback();
  window.addEventListener(EVENTO, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENTO, handler);
    window.removeEventListener("storage", handler);
  };
}

// Mesma fazenda + data + ordenha substitui a anterior (a mais nova vale, igual ao servidor).
export function guardarPesagem(p: Omit<PesagemGuardada, "id" | "guardadaEm">) {
  const fila = ler();
  const mesma = fila.find((x) => x.propriedadeId === p.propriedadeId && x.data === p.data && x.periodo === p.periodo);
  const itens = mesma
    ? [...mesma.itens.filter((i) => !p.itens.some((n) => n.vaca_id === i.vaca_id)), ...p.itens]
    : p.itens;
  const nova: PesagemGuardada = {
    ...p,
    itens,
    id: mesma?.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    guardadaEm: new Date().toISOString(),
  };
  gravar([...fila.filter((x) => x.id !== nova.id), nova]);
}

type RespostaPesagem = {
  error?: string;
  salvos?: number;
  corrigidos?: number;
  erros?: { vaca_id: string; numero: number | null; mensagem: string }[];
};

// Envia uma pesagem. Lança erro só quando não deu pra falar com o servidor (sem internet).
export async function enviarPesagem(p: {
  propriedadeId: string;
  data: string;
  periodo: string;
  itens: { vaca_id: string; litros: number }[];
}): Promise<{ status: number; corpo: RespostaPesagem }> {
  const resposta = await fetch("/api/pesagem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(p),
  });
  // sessão expirada pode virar redirecionamento pro /login (HTML): nunca contar isso como enviado
  if (!(resposta.headers.get("content-type") ?? "").includes("application/json")) {
    return { status: 401, corpo: { error: "Sua sessão expirou. Entre de novo pra enviar a pesagem." } };
  }
  return { status: resposta.status, corpo: await resposta.json() };
}

let enviando = false;

// Tenta mandar tudo que está guardado. Pesagem recusada pelo servidor (dado inválido) sai da fila
// com o erro devolvido; sem internet ou sessão expirada, fica pra próxima.
export async function enviarFila(): Promise<ResultadoEnvio> {
  if (enviando) return { enviadas: 0, restantes: ler().length, erros: [] };
  enviando = true;
  const resultado: ResultadoEnvio = { enviadas: 0, restantes: 0, erros: [] };
  try {
    for (const p of ler()) {
      let envio;
      try {
        envio = await enviarPesagem(p);
      } catch {
        resultado.falha = "Ainda sem internet.";
        break;
      }
      if (envio.status === 401) {
        resultado.falha = envio.corpo.error;
        gravar(ler().map((x) => (x.id === p.id ? { ...x, ultimoErro: envio.corpo.error } : x)));
        break;
      }
      gravar(ler().filter((x) => x.id !== p.id));
      if (envio.status === 200) {
        resultado.enviadas += 1;
        resultado.erros.push(...(envio.corpo.erros ?? []));
      } else {
        resultado.erros.push({ vaca_id: "", numero: null, mensagem: envio.corpo.error ?? "pesagem recusada" });
      }
    }
  } finally {
    enviando = false;
  }
  resultado.restantes = ler().length;
  return resultado;
}
