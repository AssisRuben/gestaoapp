// Máscara do CNPJ enquanto digita: 00.000.000/0000-00. A conferência dos dígitos verificadores é do
// banco (_cnpj_valido, 0050).
export function mascaraCnpj(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 14);
  const partes = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 8), d.slice(8, 12), d.slice(12, 14)];
  let t = partes[0];
  if (partes[1]) t += `.${partes[1]}`;
  if (partes[2]) t += `.${partes[2]}`;
  if (partes[3]) t += `/${partes[3]}`;
  if (partes[4]) t += `-${partes[4]}`;
  return t;
}
