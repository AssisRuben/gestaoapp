// Campos "perfil_<campo>" de um formulário → o jsonb que salvar_perfil_fazenda (0053) espera. Só
// entra o campo que existe no formulário: o que não foi mostrado continua como estava no banco.
const CAMPOS = [
  "area_total_ha",
  "area_leite_ha",
  "irrigado",
  "area_irrigada_ha",
  "raca",
  "inseminacao",
  "mao_de_obra",
  "pessoas",
  "ordenha",
  "ordenhas_dia",
  "destino_leite",
  "tanque",
] as const;

export function perfilDoFormulario(formData: FormData): Record<string, string> {
  const dados: Record<string, string> = {};
  for (const campo of CAMPOS) {
    const nome = `perfil_${campo}`;
    if (formData.has(nome)) dados[campo] = String(formData.get(nome) ?? "").trim();
  }
  // radio sem nada marcado não vai no formulário: o campo de presença diz que a pergunta estava lá
  if (!("irrigado" in dados) && formData.has("perfil_irrigado_presente")) dados.irrigado = "";
  return dados;
}

// Só as respostas dadas (cadastro): sem nenhuma, nada é gravado — o perfil fica pra depois.
export function perfilRespondido(formData: FormData): Record<string, string> | null {
  const respondidas = Object.entries(perfilDoFormulario(formData)).filter(([, valor]) => valor !== "");
  return respondidas.length > 0 ? Object.fromEntries(respondidas) : null;
}
