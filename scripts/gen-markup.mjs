// src/ui/markup.html -> src/ui/markup.generated.ts (sahifa shu satrni server tomonida chiqaradi)
import fs from 'node:fs';
const html = fs.readFileSync('src/ui/markup.html', 'utf8');
fs.writeFileSync('src/ui/markup.generated.ts', `// AVTOMATIK YARATILGAN (scripts/gen-markup.mjs). Qo'lda tahrirlamang.\nexport const MARKUP: string = ${JSON.stringify(html)};\n`);
