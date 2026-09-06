// Gera os icones de PWA (manifest.json), apple-touch-icon e favicon a partir da logo em
// public/gestao-pec-logo.png. Rodar de novo sempre que a logo mudar: node scripts/generate-icons.js
const sharp = require("sharp");
const fs = require("node:fs");
const path = require("node:path");

const SRC = path.join(process.cwd(), "public", "gestao-pec-logo.png");
const OUT_DIR = path.join(process.cwd(), "public", "icons");
const BG = "#2f5233"; // --brand-green, ver src/app/globals.css

async function withLogo(size, background, padding) {
  const inner = size - padding * 2;
  const logo = await sharp(SRC)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  return sharp({ create: { width: size, height: size, channels: 4, background } }).composite([
    { input: logo, gravity: "center" },
  ]);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const size of [192, 512]) {
    await (await withLogo(size, BG, Math.round(size * 0.14)))
      .png()
      .toFile(path.join(OUT_DIR, `icon-${size}.png`));

    // maskable: safe-zone maior (Android corta as bordas em mascaras circulares/squircle)
    await (await withLogo(size, BG, Math.round(size * 0.22)))
      .png()
      .toFile(path.join(OUT_DIR, `icon-maskable-${size}.png`));
  }

  // apple-touch-icon: iOS ignora alpha (pode renderizar preto), por isso flatten
  // (o favicon padrao ja e coberto pela convencao de arquivo src/app/icon.png do Next.js)
  await (await withLogo(180, BG, Math.round(180 * 0.14)))
    .flatten({ background: BG })
    .png()
    .toFile(path.join(process.cwd(), "public", "apple-touch-icon.png"));

  console.log("icones gerados em public/icons e public/apple-touch-icon.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
