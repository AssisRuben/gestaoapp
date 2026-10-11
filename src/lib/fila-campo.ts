// Lançamentos do campo (cobertura, parto, diagnóstico) guardados no celular e enviados pra
// /api/campo quando há internet. Cada lançamento tem um id gerado aqui: reenviar o mesmo id não
// lança de novo (registrar_lancamento_campo, 0035). Guarda também os últimos já enviados/recusados,
// pra a tela mostrar o que aconteceu com cada um. Só roda no navegador.

export type TipoCampo = "cobertura" | "parto" | "diagnostico";

export type LancamentoCampo = {
  id: string;
  propriedadeId: string;
  tipo: TipoCampo;
  dados: Record<string, string | number | boolean | null>;
  descricao: string;
  guardadoEm: string;
  estado: "guardado" | "enviado" | "recusado";
  mensagem?: string;
};

const CHAVE = "gestaopec:fila-campo";
const EVENTO = "gestaopec:fila-campo-mudou";
const HISTORICO = 15;

function ler(): LancamentoCampo[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) ?? "[]");
  } catch {
    return [];
  }
}

function gravar(lista: LancamentoCampo[]) {
  // mantém tudo que falta enviar + os últimos resolvidos
  const guardados = lista.filter((l) => l.estado === "guardado");
  const resolvidos = lista.filter((l) => l.estado !== "guardado").slice(-HISTORICO);
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...resolvidos, ...guardados]));
  } catch {
    // sem armazenamento (navegação privada)
  }
  window.dispatchEvent(new Event(EVENTO));
}

export function lancamentosCampo(): LancamentoCampo[] {
  return ler();
}

export function aoMudarCampo(callback: () => void) {
  const handler = () => callback();
  window.addEventListener(EVENTO, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENTO, handler);
    window.removeEventListener("storage", handler);
  };
}

export function guardarLancamento(l: Omit<LancamentoCampo, "id" | "guardadoEm" | "estado">): LancamentoCampo {
  const novo: LancamentoCampo = { ...l, id: crypto.randomUUID(), guardadoEm: new Date().toISOString(), estado: "guardado" };
  gravar([...ler(), novo]);
  return novo;
}

function atualizar(id: string, mudanca: Partial<LancamentoCampo>) {
  gravar(ler().map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
}

let enviando = false;

// Envia os guardados, em ordem. Sem internet ou sessão expirada: para e mantém o resto guardado.
export async function enviarCampo(): Promise<{ enviados: number; recusados: number; falha?: string }> {
  const resultado = { enviados: 0, recusados: 0, falha: undefined as string | undefined };
  if (enviando) return resultado;
  enviando = true;
  try {
    for (const l of ler().filter((x) => x.estado === "guardado")) {
      let resposta: Response;
      try {
        resposta = await fetch("/api/campo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: l.id, propriedadeId: l.propriedadeId, tipo: l.tipo, dados: l.dados }),
        });
      } catch {
        resultado.falha = "Ainda sem internet.";
        break;
      }
      // redirecionamento pro /login (HTML) = sessão expirada, nunca "enviado"
      const json = (resposta.headers.get("content-type") ?? "").includes("application/json");
      if (resposta.status === 401 || !json) {
        resultado.falha = "Sua sessão expirou. Entre de novo pra enviar.";
        break;
      }
      const corpo = (await resposta.json()) as { ok?: boolean; mensagem?: string; error?: string };
      if (resposta.ok && corpo.ok) {
        atualizar(l.id, { estado: "enviado", mensagem: corpo.mensagem });
        resultado.enviados += 1;
      } else {
        atualizar(l.id, { estado: "recusado", mensagem: corpo.mensagem ?? corpo.error ?? "lançamento recusado" });
        resultado.recusados += 1;
      }
    }
  } finally {
    enviando = false;
  }
  return resultado;
}
