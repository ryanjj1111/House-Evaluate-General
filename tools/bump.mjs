// 改版時更新 index.html 裡所有 js 的 ?v=（避免手機用到舊的快取）。用法：node tools/bump.mjs
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const f = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../index.html');
const d = new Date(), z = n => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}${z(d.getHours())}${z(d.getMinutes())}`;
const s = fs.readFileSync(f, 'utf8'), out = s.replace(/(\.js\?v=)[\w.-]+/g, '$1' + v);
fs.writeFileSync(f, out);
console.log('版本號 →', v);
