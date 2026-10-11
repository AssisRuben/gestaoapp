// Carrega um arquivo .ts de src/lib como módulo ES pros testes (transpila com o TypeScript do
// projeto pra uma pasta temporária; os imports relativos entre arquivos de src/lib são resolvidos).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = createRequire(path.join(raiz, "package.json"))("typescript");
const saida = fs.mkdtempSync(path.join(os.tmpdir(), "gestaopec-testes-"));

function transpilar(nome) {
  const destino = path.join(saida, `${nome}.mjs`);
  if (fs.existsSync(destino)) return destino;
  const fonte = fs.readFileSync(path.join(raiz, "src/lib", `${nome}.ts`), "utf8");
  let js = ts.transpileModule(fonte, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  // import "./datas" → transpila também e aponta pro .mjs
  js = js.replace(/from "\.\/([\w-]+)"/g, (_, dep) => {
    transpilar(dep);
    return `from "./${dep}.mjs"`;
  });
  fs.writeFileSync(destino, js);
  return destino;
}

export async function carregar(nome) {
  return import(pathToFileURL(transpilar(nome)).href);
}

export const RAIZ = raiz;

// mini runner: conta falhas e imprime o resultado
let falhas = 0;
export function ok(condicao, mensagem) {
  if (condicao) console.log(`  ok - ${mensagem}`);
  else {
    falhas++;
    console.log(`  FALHOU - ${mensagem}`);
  }
}
export function terminar(nome) {
  if (falhas) {
    console.error(`${nome}: ${falhas} falha(s)`);
    process.exit(1);
  }
  console.log(`${nome}: tudo certo`);
}
