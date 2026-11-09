// Actualiza prices.js con los precios de Findit (finditapp.es).
// Lo ejecuta GitHub Actions cada lunes. Uso manual: node scripts/update_prices.mjs
// Sin dependencias: Node 18+ (usa fetch nativo).
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const FILE = path.join(ROOT, 'prices.js');
const SUPERS = ['mercadona', 'carrefour', 'dia', 'aldi', 'eroski', 'alcampo'];
const DELAY_MS = +(process.env.DELAY_MS ?? 700);          // pausa entre peticiones, para no saturar la web
const MAX_CHANGE = 0.6;        // si un precio cambia más de un 60 %, se mantiene el anterior

// slug de búsqueda, filtro de nombre, unidad de la app y conversión
// conv: kg/l -> el precio por kg o litro se multiplica por ese factor para pasarlo a "ud"
const Q = {
  arroz: ['arroz', /^arroz (redondo|largo)/i],
  pasta: ['macarrones', /^macarr/i],
  lentejas: ['lentejas', /lenteja.*pardina/i],
  garbanzos: ['garbanzos-cocidos', /garbanzo.*cocid/i],
  tomateTriturado: ['tomate-triturado', /tomate triturado/i],
  aceite: ['aceite-de-oliva', /^aceite de oliva (0|1|suave|intenso)/i],
  harina: ['harina', /^harina de trigo/i],
  pan: ['barra-de-pan', /barra/i, { kg: 0.25 }],
  tortillas: ['tortillas-de-trigo', /tortilla.*trigo/i, { kg: 0.04 }],
  atun: ['atun-claro', /at[uú]n claro/i, { kg: 0.08 }],
  pollo: ['pechuga-de-pollo', /pechuga.*pollo/i],
  muslos: ['muslos-de-pollo', /muslo.*pollo/i],
  picada: ['carne-picada', /carne picada|picad[ao] de (cerdo|vacuno|ternera|pollo)/i],
  lomo: ['lomo-de-cerdo', /lomo.*cerdo/i],
  merluza: ['merluza', /merluza/i],
  salmon: ['salmon', /salm[oó]n/i],
  chorizo: ['chorizo', /chorizo/i],
  jamon: ['jamon-cocido', /jam[oó]n cocido/i],
  huevos: ['huevos', /huevos/i, { ud: 1 }],
  queso: ['queso-rallado', /queso rallado/i],
  leche: ['leche-semidesnatada', /leche semidesnatada/i],
  nata: ['nata-para-cocinar', /nata.*cocinar/i],
  patata: ['patatas', /^patatas?( |$)/i],
  cebolla: ['cebolla', /^cebollas?( |$)/i],
  tomate: ['tomate', /^tomates? (rama|pera|canario|ensalada|redondo|kumato)/i],
  pimiento: ['pimiento', /^pimientos? (rojo|verde|italiano)/i],
  calabacin: ['calabacin', /^calabac[ií]n/i],
  zanahoria: ['zanahoria', /^zanahorias?/i],
  lechuga: ['lechuga', /lechuga|cogollo/i, { ud: 1 }],
  champi: ['champinones', /champi/i],
  espinacas: ['espinacas', /espinaca/i],
  limon: ['limon', /^limon(es)?( |$)|^lim[oó]n /i, { kg: 0.12, ud: 1 }],
  pepino: ['pepino', /^pepino/i],
  guisantes: ['guisantes', /guisante/i],
  gambas: ['gambas', /gamba/i],
  masaPizza: ['masa-de-pizza', /masa.*pizza/i, { kg: 0.3 }],
  mozzarella: ['mozzarella', /mozzarella/i],
};
const BAD = /crema|tarrito|chocolate|helado|snack|chips|frita|prefrit|rebozad|varita|nugget|ahumad|codorniz|polvo|caramel|zumo|limonada|exprimid|piquillo|asad|salsa|pur[eé]|pienso|gato|perro|beb[eé]|galleta|lonchas.*lomo|lomo.*(cocido|embuchado|adobado|marinado)|embuchad|tortilla de patata|gazpacho|sopa|croqueta|empanad|fideos|noodles|sucedáneo|pan de gamba|con bechamel|listo para comer|paté|natural .*lata|toallita|lej[ií]a|friegasuelo|detergente/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const num = s => +String(s || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.');
const clean = s => s.replace(/<!--.*?-->/g, '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

export function parseRows(html) {
  const rows = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/g) || []) {
    const tds = (tr.match(/<td[\s\S]*?<\/td>/g) || []).map(clean);
    if (tds.length >= 4) rows.push({ name: tds[0], size: tds[1], price: num(tds[2]), ppu: num(tds[3]), unit: (tds[3].split('/').pop() || '').trim().toLowerCase() });
  }
  return rows;
}

// convierte una fila al precio por unidad que usa la app (kg, L o ud)
export function normalize(key, row) {
  const conv = Q[key][2];
  if (!row.ppu || !(row.ppu > 0)) return null;
  if (conv) {
    if (key === 'lechuga' && /cogollo/i.test(row.name) && row.unit === 'ud') return row.ppu * 2;
    if (row.unit === 'ud' && conv.ud) return row.ppu;
    if ((row.unit === 'kg' || row.unit === 'l') && conv.kg) return row.ppu * conv.kg;
    return null;
  }
  return row.unit === 'kg' || row.unit === 'l' ? row.ppu : null;
}

async function fetchPage(sup, slug) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch(`https://finditapp.es/supermercado/${sup}/${slug}`, {
        headers: { 'User-Agent': 'CestaFacil-precios/1.0 (actualizacion semanal)', 'Accept-Language': 'es-ES' },
        signal: AbortSignal.timeout(20000),
      });
      if (r.status === 404) return '';
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) { await sleep(3000 * (t + 1)); }
  }
  return null; // fallo de red: se mantienen los precios anteriores
}

function loadOld() {
  const src = fs.readFileSync(FILE, 'utf8');
  return new Function(src + ';return PRICES')();
}

function median(a) { a = a.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; }

async function main() {
  const old = loadOld();
  const cand = {}; // cand[sup][key] = [{p,name}]
  let fetched = 0, failed = 0;
  for (const sup of SUPERS) {
    cand[sup] = {};
    for (const [key, [slug, re]] of Object.entries(Q)) {
      const html = await fetchPage(sup, slug);
      await sleep(DELAY_MS);
      if (html === null) { failed++; continue; }
      fetched++;
      cand[sup][key] = parseRows(html)
        .filter(r => re.test(r.name) && !BAD.test(r.name))
        .map(r => ({ p: normalize(key, r), name: r.name.replace(/\.$/, '') }))
        .filter(c => c.p);
    }
  }
  if (fetched < 20) { console.error(`Solo ${fetched} páginas descargadas (${failed} fallos). No se cambia nada.`); process.exit(1); }

  const out = { lidl: {} }, log = [];
  for (const key of Object.keys(Q)) {
    const all = SUPERS.flatMap(s => (cand[s][key] || []).map(c => c.p));
    const ref = all.length ? median(all) : null;
    for (const sup of SUPERS) {
      out[sup] = out[sup] || {};
      const prev = old[sup] && old[sup][key];
      // descarta precios absurdos (menos del 40 % o más del 300 % de la mediana entre supermercados)
      const ok = (cand[sup][key] || []).filter(c => !ref || (c.p >= ref * 0.4 && c.p <= ref * 3)).sort((a, b) => a.p - b.p);
      let best = ok[0] ? [Math.round(ok[0].p * 100) / 100, ok[0].name] : null;
      if (best && prev && Math.abs(best[0] - prev[0]) / prev[0] > MAX_CHANGE) {
        log.push(`${sup}/${key}: ${prev[0]} -> ${best[0]} (cambio grande, se mantiene el anterior)`);
        best = prev;
      }
      if (!best && prev) best = prev; // sin dato esta semana: se mantiene el de la anterior
      out[sup][key] = best;
      if (best && prev && best !== prev && best[0] !== prev[0]) log.push(`${sup}/${key}: ${prev[0]} -> ${best[0]}`);
    }
  }
  const date = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }).replace('.', '');
  const body = Object.entries(out).map(([s, o]) => `${s}:${JSON.stringify(o)}`).join(',\n');
  fs.writeFileSync(FILE, `// Generado automáticamente por scripts/update_prices.mjs\nconst PRICE_DATE=${JSON.stringify(date)};\nconst PRICES={\n${body}\n};\n`);
  console.log(`Precios actualizados (${date}). Páginas: ${fetched}, fallos: ${failed}. Cambios: ${log.length}`);
  log.forEach(l => console.log(' - ' + l));
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) main();
