"use server";

import { createClient } from "@/lib/supabase/server";

export type CadastroState = { error?: string; success?: boolean } | undefined;

const JA_CADASTRADO =
  "Esse e-mail já tem conta no Gestão Pec. Entre com ele na tela de login (ou use \"Esqueci minha senha\"). Pra uma conta nova, use outro e-mail.";

// E-mail que já tem conta: com confirmação de e-mail ligada, o Supabase NÃO devolve erro (pra não
// revelar quais e-mails existem) — devolve um usuário sem nenhuma identidade. Sem confirmação, vem
// o erro "User already registered". Nos dois casos o cadastro não criou nada, então avisamos.
function resultadoCadastro(
  data: { user: { identities?: unknown[] | null } | null },
  error: { message: string } | null,
): CadastroState {
  if (error) {
    if (/already registered|already exists/i.test(error.message)) return { error: JA_CADASTRADO };
    // limite de envio do e-mail padrão do Supabase (poucos por hora, somando confirmações e senhas)
    if (/rate limit/i.test(error.message)) {
      return { error: "Muitos e-mails enviados pelo sistema em pouco tempo. Tente de novo daqui a uma hora." };
    }
    return { error: error.message };
  }
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    return { error: JA_CADASTRADO };
  }
  return { success: true };
}

export async function cadastrarNovaFazenda(
  _state: CadastroState,
  formData: FormData,
): Promise<CadastroState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const whatsapp = String(formData.get("whatsapp") ?? "").trim();
  const digitos = whatsapp.replace(/\D/g, "");
  if (whatsapp && (digitos.length < 10 || digitos.length > 13)) {
    return { error: "WhatsApp inválido. Informe com DDD, por exemplo (85) 99999-9999." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        nome_propriedade: formData.get("nome_propriedade") as string,
        nome_produtor: formData.get("nome_produtor") as string,
        municipio: (formData.get("municipio") as string) || null,
        estado: (formData.get("estado") as string) || null,
        tecnico_responsavel: (formData.get("tecnico_responsavel") as string) || null,
        whatsapp: whatsapp || null,
      },
    },
  });

  return resultadoCadastro(data, error);
}

// Conta sem fazenda: sem nome_propriedade no metadata o trigger de 0013 não cria propriedade. Serve
// pro técnico (acesso dado pelo produtor ou pelo gestor, 0023) e pro produtor cuja fazenda já usa o
// bot pelo WhatsApp (o gestor liga a conta à fazenda existente como produtor, 0044) — antes ele
// usava "Sou produtor" e ganhava uma segunda fazenda vazia.
export async function cadastrarSemFazenda(
  _state: CadastroState,
  formData: FormData,
): Promise<CadastroState> {
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return { error: "Informe seu nome." };
  const perfil = formData.get("perfil") === "produtor" ? "produtor" : "tecnico";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
    options: { data: { nome, perfil } },
  });

  return resultadoCadastro(data, error);
}
