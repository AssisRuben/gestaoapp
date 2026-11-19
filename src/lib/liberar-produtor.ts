import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

// Libera o acesso de produtor pelo e-mail (0063). Quem pede: produtor, técnico da fazenda ou gestor.
// Sem conta com esse e-mail, cria uma já confirmada e manda o e-mail "Criar nova senha" (o mesmo do
// Esqueci minha senha). A criação usa a service role, que não sabe quem pediu: por isso a permissão é
// conferida ANTES, com a sessão de quem está logado, e de novo em vincular_produtor.

export type ResultadoLiberarProdutor = { error?: string; contaNova?: boolean; emailEnviado?: boolean };

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function liberarProdutorPorEmail(
  supabase: SupabaseClient,
  propriedadeId: string,
  emailDigitado: string,
  nomeProdutor: string | null,
): Promise<ResultadoLiberarProdutor> {
  const email = emailDigitado.trim().toLowerCase();
  if (!EMAIL_VALIDO.test(email)) return { error: "E-mail inválido. Confira o que foi digitado." };

  const { data: pode, error: erroPode } = await supabase.rpc("pode_liberar_produtor", {
    p_propriedade_id: propriedadeId,
  });
  if (erroPode) return { error: erroPode.message };
  if (pode !== true) return { error: "Só o produtor, o técnico da fazenda ou o gestor pode liberar acesso de produtor." };

  const service = createServiceClient();
  let contaNova = false;
  let novoId: string | null = null;
  const nome = nomeProdutor?.trim();
  const { data: criado, error: erroCriar } = await service.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: nome ? { nome } : {},
  });
  if (erroCriar) {
    // conta que já existe: só liga (como o "Dar acesso ao site" sempre fez)
    const jaExiste = erroCriar.code === "email_exists" || /already|registered|exists/i.test(erroCriar.message);
    if (!jaExiste) return { error: `Não consegui criar a conta: ${erroCriar.message}` };
  } else {
    contaNova = true;
    novoId = criado.user?.id ?? null;
  }

  const { error: erroVincular } = await supabase.rpc("vincular_produtor", {
    p_propriedade_id: propriedadeId,
    p_email: email,
  });
  if (erroVincular) {
    // não deixa conta solta criada agora sem fazenda
    if (novoId) await service.auth.admin.deleteUser(novoId);
    return { error: erroVincular.message };
  }

  if (!contaNova) return { contaNova: false };
  const { error: erroEmail } = await service.auth.resetPasswordForEmail(email);
  return { contaNova: true, emailEnviado: !erroEmail };
}

export function mensagemLiberarProdutor(email: string, r: ResultadoLiberarProdutor): string {
  const e = email.trim().toLowerCase();
  if (!r.contaNova) return `Acesso liberado! ${e} já tinha conta e entra com a senha dele.`;
  if (r.emailEnviado) return `Acesso liberado! ${e} recebeu um e-mail para criar a senha.`;
  return `Acesso liberado, mas o e-mail para criar a senha não saiu. Peça ao produtor para entrar no site e tocar em "Esqueci minha senha" com ${e}.`;
}
