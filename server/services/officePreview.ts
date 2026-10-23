/**
 * Pré-visualização de Excel (.xlsx/.xlsm) e Word (.docx) sem programas extras:
 * os dois formatos são pacotes ZIP com XML, lidos aqui e devolvidos como dados simples
 * (tabela de textos / blocos de texto). O navegador monta a tela a partir desses dados,
 * sem HTML vindo do arquivo — nada do documento consegue executar código na página.
 */
import path from 'path';
import { listZip, readZipText, ZipEntry } from './zipReader';

// ------------------------------------------------------------------ XML mínimo
export type XNode = { name: string; attrs: Record<string, string>; children: XNode[]; text?: string };

const ENTITY: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : '';
    }
    return ENTITY[e];
  });
}

function parseAttrs(src: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) attrs[m[1]] = decodeEntities(m[3] ?? m[4] ?? '');
  return attrs;
}

/** Converte XML em árvore (suficiente para os arquivos do Office) */
export function parseXml(xml: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [] };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) {
      top.children.push({ name: '#text', attrs: {}, children: [], text: m[1] });
    } else if (m[3]) {
      if (m[2] === '/') {
        // fecha até achar a tag correspondente (tolerante a XML levemente errado)
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].name === m[3]) {
            stack.length = i;
            break;
          }
        }
      } else {
        const node: XNode = { name: m[3], attrs: parseAttrs(m[4] || ''), children: [] };
        top.children.push(node);
        if (!m[5]) stack.push(node);
      }
    } else if (m[6] !== undefined) {
      if (m[6].trim() || top.name.endsWith(':t') || top.name === 't') {
        top.children.push({ name: '#text', attrs: {}, children: [], text: decodeEntities(m[6]) });
      }
    }
  }
  return root;
}

const local = (name: string) => name.slice(name.indexOf(':') + 1);
export const kids = (n: XNode | undefined, name?: string) => (n ? n.children.filter((c) => c.name !== '#text' && (!name || local(c.name) === name)) : []);
export const kid = (n: XNode | undefined, name: string) => kids(n, name)[0];
export function find(n: XNode | undefined, name: string): XNode | undefined {
  if (!n) return undefined;
  for (const c of n.children) {
    if (local(c.name) === name) return c;
    const f = find(c, name);
    if (f) return f;
  }
  return undefined;
}
export function textOf(n: XNode | undefined): string {
  if (!n) return '';
  if (n.name === '#text') return n.text || '';
  return n.children.map(textOf).join('');
}
const attr = (n: XNode | undefined, name: string) => {
  if (!n) return undefined;
  for (const k of Object.keys(n.attrs)) if (local(k) === name) return n.attrs[k];
  return undefined;
};

function relsMap(xml: string | null): Map<string, { target: string; external: boolean }> {
  const map = new Map<string, { target: string; external: boolean }>();
  if (!xml) return map;
  for (const r of kids(kid(parseXml(xml), 'Relationships'), 'Relationship')) {
    map.set(r.attrs.Id, { target: r.attrs.Target || '', external: r.attrs.TargetMode === 'External' });
  }
  return map;
}

/** Caminho dentro do pacote, resolvendo "../" a partir da pasta da parte */
function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  return path.posix.normalize(path.posix.join(baseDir, target));
}

// ------------------------------------------------------------------ EXCEL
/** Aparência de uma célula (só valores conferidos: cores #RRGGBB, tamanhos em números) */
export type CellStyle = {
  b?: 1; i?: 1; u?: 1; s?: 1;
  sz?: number; // tamanho da fonte (pt)
  font?: string;
  color?: string;
  bg?: string;
  h?: 'left' | 'center' | 'right' | 'justify';
  v?: 'top' | 'middle' | 'bottom';
  wrap?: 1;
  indent?: number;
  bt?: string; bb?: string; bl?: string; br?: string; // bordas: "1px solid #RRGGBB"
};
export type SheetPreview = {
  name: string;
  rows: string[][];
  totalRows: number;
  totalCols: number;
  truncated: boolean;
  /** Formatação como no Excel (opcional: CSV não tem) */
  styles?: CellStyle[];
  cellStyles?: number[][]; // índice em styles por célula (-1 = sem formatação)
  colWidths?: number[]; // px; 0 = coluna oculta
  rowHeights?: Array<number | null>; // px; 0 = linha oculta
  merges?: Array<{ r: number; c: number; rs: number; cs: number }>;
  showGrid?: boolean;
};

// Paleta "indexed" padrão do Excel
const INDEXED = '000000,FFFFFF,FF0000,00FF00,0000FF,FFFF00,FF00FF,00FFFF,000000,FFFFFF,FF0000,00FF00,0000FF,FFFF00,FF00FF,00FFFF,800000,008000,000080,808000,800080,008080,C0C0C0,808080,9999FF,993366,FFFFCC,CCFFFF,660066,FF8080,0066CC,CCCCFF,000080,FF00FF,FFFF00,00FFFF,800080,800000,008080,0000FF,00CCFF,CCFFFF,CCFFCC,FFFF99,99CCFF,FF99CC,CC99FF,FFCC99,3366FF,33CCCC,99CC00,FFCC00,FF9900,FF6600,666699,969696,003366,339966,003300,333300,993300,993366,333399,333333'.split(',');

function applyTint(hex: string, tint: number): string {
  if (!tint) return hex;
  const n = parseInt(hex, 16);
  let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, sat = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (sat === 0) r = g = b = l;
  else {
    const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
    const p = 2 * l - q;
    r = hue(p, q, h + 1 / 3);
    g = hue(p, q, h);
    b = hue(p, q, h - 1 / 3);
  }
  return [r, g, b].map((x) => Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Cor do Excel (rgb, theme ou indexed, com tint) → #RRGGBB */
function excelColor(node: XNode | undefined, theme: string[]): string | undefined {
  if (!node) return undefined;
  const a = node.attrs;
  let hex: string | undefined;
  if (a.rgb && /^[0-9A-Fa-f]{6,8}$/.test(a.rgb)) hex = a.rgb.slice(-6);
  else if (a.theme !== undefined && theme[Number(a.theme)]) hex = theme[Number(a.theme)];
  else if (a.indexed !== undefined) {
    const i = Number(a.indexed);
    hex = i === 64 ? '000000' : i === 65 ? 'FFFFFF' : INDEXED[i];
  } else if (a.auto) hex = '000000';
  if (!hex) return undefined;
  return '#' + applyTint(hex.toUpperCase(), Number(a.tint) || 0);
}

const BORDER_CSS: Record<string, string> = {
  thin: '1px solid',
  hair: '1px dotted',
  dotted: '1px dotted',
  dashed: '1px dashed',
  dashDot: '1px dashed',
  dashDotDot: '1px dashed',
  medium: '2px solid',
  mediumDashed: '2px dashed',
  mediumDashDot: '2px dashed',
  mediumDashDotDot: '2px dashed',
  slantDashDot: '2px dashed',
  thick: '3px solid',
  double: '3px double',
};

const MAX_ROWS = 2000;
const MAX_COLS = 100;

function colIndex(ref: string): number {
  const letters = (ref.match(/^[A-Z]+/i) || [''])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
type NumFmt = { date: boolean; time: boolean; percent: boolean; decimals: number | null; currency: string; thousands: boolean };

function describeFormat(id: number, code: string | undefined): NumFmt {
  const f: NumFmt = { date: false, time: false, percent: false, decimals: null, currency: '', thousands: false };
  if (BUILTIN_DATE_FORMATS.has(id)) {
    f.date = id <= 17 || id === 22;
    f.time = (id >= 18 && id <= 22) || id >= 45;
    return f;
  }
  if (id === 9 || id === 10) return { ...f, percent: true, decimals: id === 10 ? 2 : 0 };
  if (id === 2 || id === 4) f.decimals = 2;
  if (id === 3 || id === 4) f.thousands = true;
  if (id === 1 || id === 3) f.decimals = 0;
  if (!code) return f;
  const clean = code.split(';')[0].replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
  f.date = /[dy]/i.test(clean);
  f.time = /[hs]/i.test(clean);
  if (f.date || f.time) return f;
  if (clean.includes('%')) f.percent = true;
  const dec = clean.match(/\.([0#]+)/);
  f.decimals = dec ? dec[1].length : clean.match(/[0#]/) ? 0 : null;
  f.thousands = /#,##|0,0/.test(clean);
  const cur = code.match(/\[\$([^\]-]+)/) || code.match(/"(R\$|US\$|\$|€)\s?"/) || code.match(/(R\$|US\$|€)/);
  if (cur) f.currency = cur[1].trim();
  return f;
}

function formatNumber(value: number, fmt: NumFmt | undefined, date1904: boolean): string {
  if (!Number.isFinite(value)) return '';
  if (fmt && (fmt.date || fmt.time)) {
    const ms = (value - (date1904 ? -1462 : 0) - 25569) * 86400000;
    const d = new Date(Math.round(ms));
    if (Number.isNaN(d.getTime())) return String(value);
    const p = (n: number) => String(n).padStart(2, '0');
    const datePart = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
    const timePart = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
    if (fmt.date && fmt.time) return `${datePart} ${timePart}`;
    return fmt.date ? datePart : timePart;
  }
  if (fmt?.percent) {
    return `${(value * 100).toLocaleString('pt-BR', { minimumFractionDigits: fmt.decimals ?? 0, maximumFractionDigits: fmt.decimals ?? 2 })}%`;
  }
  const decimals = fmt?.decimals;
  const text =
    decimals !== null && decimals !== undefined
      ? value.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: Boolean(fmt?.thousands || fmt?.currency) })
      : Number.isInteger(value)
      ? String(value)
      : value.toLocaleString('pt-BR', { maximumFractionDigits: 10, useGrouping: false });
  return fmt?.currency ? `${fmt.currency} ${text}` : text;
}

export async function previewXlsx(filePath: string): Promise<{ sheets: SheetPreview[] }> {
  const { entries } = await listZip(filePath);
  const read = (name: string, max?: number) => readZipText(filePath, entries, name, max);

  const workbookXml = await read('xl/workbook.xml');
  if (!workbookXml) throw new Error('Planilha inválida (sem xl/workbook.xml). Se for um .xls antigo, baixe o arquivo.');
  const workbook = parseXml(workbookXml);
  const date1904 = ['1', 'true'].includes(String(attr(find(workbook, 'workbookPr'), 'date1904') || ''));
  const rels = relsMap(await read('xl/_rels/workbook.xml.rels'));

  // Textos compartilhados
  const shared: string[] = [];
  const sst = await read('xl/sharedStrings.xml', 100 * 1024 * 1024);
  if (sst) {
    const re = /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>|<(?:\w+:)?si\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sst))) {
      const inner = (m[1] || '').replace(/<(?:\w+:)?rPh\b[\s\S]*?<\/(?:\w+:)?rPh>/g, '');
      let text = '';
      const t = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g;
      let tm: RegExpExecArray | null;
      while ((tm = t.exec(inner))) text += decodeEntities(tm[1]);
      shared.push(text);
    }
  }

  // Cores do tema (para "theme" nas cores)
  const theme: string[] = [];
  const themeXml = await read('xl/theme/theme1.xml');
  if (themeXml) {
    const scheme = find(parseXml(themeXml), 'clrScheme');
    const pick = (name: string) => {
      const n = kid(scheme, name);
      const c = kid(n, 'srgbClr') || kid(n, 'sysClr');
      return (c?.attrs.val && c.name.endsWith('srgbClr') ? c.attrs.val : c?.attrs.lastClr) || undefined;
    };
    // Ordem usada pelo Excel nos índices de tema
    for (const name of ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
      theme.push((pick(name) || '').toUpperCase());
    }
  }

  // Formatos de número (datas, %, moeda) e aparência (fonte, preenchimento, bordas, alinhamento)
  const styleFormats: NumFmt[] = [];
  const xfStyle: CellStyle[] = [];
  const stylesXml = await read('xl/styles.xml');
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map<number, string>();
    for (const nf of kids(find(styles, 'numFmts'), 'numFmt')) custom.set(Number(nf.attrs.numFmtId), nf.attrs.formatCode);
    const fonts = kids(find(styles, 'fonts'), 'font');
    const fills = kids(find(styles, 'fills'), 'fill');
    const borders = kids(find(styles, 'borders'), 'border');
    const defaultFont = fonts[0];
    const defaultSize = Number(attr(kid(defaultFont, 'sz'), 'val')) || 11;
    const defaultName = attr(kid(defaultFont, 'name'), 'val') || 'Calibri';
    for (const xf of kids(find(styles, 'cellXfs'), 'xf')) {
      const id = Number(xf.attrs.numFmtId || 0);
      styleFormats.push(describeFormat(id, custom.get(id)));
      const st: CellStyle = {};
      const font = fonts[Number(xf.attrs.fontId || 0)];
      if (font) {
        if (kid(font, 'b') && attr(kid(font, 'b'), 'val') !== '0') st.b = 1;
        if (kid(font, 'i') && attr(kid(font, 'i'), 'val') !== '0') st.i = 1;
        if (kid(font, 'u') && attr(kid(font, 'u'), 'val') !== 'none') st.u = 1;
        if (kid(font, 'strike') && attr(kid(font, 'strike'), 'val') !== '0') st.s = 1;
        const sz = Number(attr(kid(font, 'sz'), 'val'));
        if (sz && sz !== defaultSize) st.sz = Math.min(72, Math.max(6, sz));
        const name = attr(kid(font, 'name'), 'val');
        if (name && name !== defaultName && /^[\w .-]{1,40}$/.test(name)) st.font = name;
        const color = excelColor(kid(font, 'color'), theme);
        if (color && color !== '#000000') st.color = color;
      }
      const fill = fills[Number(xf.attrs.fillId || 0)];
      const pattern = kid(fill, 'patternFill');
      if (pattern && pattern.attrs.patternType && pattern.attrs.patternType !== 'none') {
        const bg = excelColor(kid(pattern, 'fgColor'), theme) || excelColor(kid(pattern, 'bgColor'), theme);
        if (bg) st.bg = bg;
      }
      const border = borders[Number(xf.attrs.borderId || 0)];
      if (border) {
        for (const [side, key] of [['top', 'bt'], ['bottom', 'bb'], ['left', 'bl'], ['right', 'br']] as const) {
          const b = kid(border, side);
          const css = b && BORDER_CSS[b.attrs.style || ''];
          if (css) (st as any)[key] = `${css} ${excelColor(kid(b, 'color'), theme) || '#000000'}`;
        }
      }
      const al = kid(xf, 'alignment');
      if (al) {
        const h = al.attrs.horizontal;
        if (h === 'center' || h === 'centerContinuous') st.h = 'center';
        else if (h === 'right') st.h = 'right';
        else if (h === 'justify' || h === 'distributed') st.h = 'justify';
        else if (h === 'left') st.h = 'left';
        const v = al.attrs.vertical;
        st.v = v === 'top' ? 'top' : v === 'center' || v === 'distributed' || v === 'justify' ? 'middle' : undefined;
        if (al.attrs.wrapText === '1' || al.attrs.wrapText === 'true') st.wrap = 1;
        const ind = Number(al.attrs.indent);
        if (ind > 0) st.indent = Math.min(ind, 15);
      }
      if (!st.v) delete st.v;
      xfStyle.push(st);
    }
  }

  const sheets: SheetPreview[] = [];
  for (const sh of kids(find(workbook, 'sheets'), 'sheet')) {
    if (sh.attrs.state === 'hidden' || sh.attrs.state === 'veryHidden') continue;
    const rel = rels.get(attr(sh, 'id') || '');
    if (!rel) continue;
    const sheetPath = resolvePart('xl', rel.target);
    const xml = await read(sheetPath, 150 * 1024 * 1024);
    if (!xml) continue;

    const rows: string[][] = [];
    const cellStyleRows: number[][] = [];
    const rowHeights: Array<number | null> = [];
    let maxCol = 0;
    let totalRows = 0;
    let truncated = false;
    const dim = xml.match(/<(?:\w+:)?dimension\b[^>]*ref="([A-Z]+\d+:)?([A-Z]+)(\d+)"/i);
    if (dim) totalRows = Number(dim[3]) || 0;

    // Estilos usados (deduplicados por planilha)
    const styleList: CellStyle[] = [];
    const styleIdx = new Map<string, number>();
    const styleOf = (s: number): number => {
      const st = xfStyle[s];
      if (!st || !Object.keys(st).length) return -1;
      const key = JSON.stringify(st);
      let i = styleIdx.get(key);
      if (i === undefined) {
        i = styleList.length;
        styleList.push(st);
        styleIdx.set(key, i);
      }
      return i;
    };

    // Larguras das colunas e altura padrão
    const fmtPr = xml.match(/<(?:\w+:)?sheetFormatPr\b([^>]*)>/);
    const fmtAttrs = fmtPr ? parseAttrs(fmtPr[1]) : {};
    const defaultColPx = Math.round((Number(fmtAttrs.defaultColWidth) || (Number(fmtAttrs.baseColWidth) || 8) + 0.71) * 7 + 5);
    const defaultRowPx = Math.round((Number(fmtAttrs.defaultRowHeight) || 15) * (4 / 3));
    const colWidths: number[] = [];
    const colStyle: number[] = [];
    const colsBlock = xml.match(/<(?:\w+:)?cols\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cols>/);
    if (colsBlock) {
      const re = /<(?:\w+:)?col\b([^>]*?)\/?>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(colsBlock[1]))) {
        const a = parseAttrs(m[1]);
        const min = Math.max(1, Number(a.min) || 1);
        const max = Math.min(MAX_COLS, Number(a.max) || min);
        const px = a.hidden === '1' || a.hidden === 'true' ? 0 : a.width ? Math.round(Number(a.width) * 7 + 5) : defaultColPx;
        for (let c = min; c <= max; c++) {
          colWidths[c - 1] = px;
          if (a.style) colStyle[c - 1] = Number(a.style);
        }
      }
    }

    // Células mescladas
    const merges: Array<{ r: number; c: number; rs: number; cs: number }> = [];
    const mergeRe = /<(?:\w+:)?mergeCell\b[^>]*ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"/gi;
    let mm: RegExpExecArray | null;
    while ((mm = mergeRe.exec(xml)) && merges.length < 5000) {
      const c = colIndex(mm[1]), r = Number(mm[2]) - 1, c2 = colIndex(mm[3]), r2 = Number(mm[4]) - 1;
      if (r < MAX_ROWS && c < MAX_COLS) merges.push({ r, c, rs: Math.min(r2, MAX_ROWS - 1) - r + 1, cs: Math.min(c2, MAX_COLS - 1) - c + 1 });
    }
    const showGrid = !/<(?:\w+:)?sheetView\b[^>]*showGridLines="(0|false)"/.test(xml);

    const rowRe = /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g;
    let rm: RegExpExecArray | null;
    let nextRow = 0;
    while ((rm = rowRe.exec(xml))) {
      const ra = parseAttrs(rm[1]);
      const rowIdx = ra.r ? Number(ra.r) - 1 : nextRow;
      nextRow = rowIdx + 1;
      totalRows = Math.max(totalRows, rowIdx + 1);
      if (rowIdx >= MAX_ROWS) {
        truncated = true;
        continue; // continua só para contar as linhas
      }
      rowHeights[rowIdx] = ra.hidden === '1' || ra.hidden === 'true' ? 0 : ra.ht ? Math.round(Number(ra.ht) * (4 / 3)) : null;
      const rowStyle = ra.customFormat === '1' && ra.s ? Number(ra.s) : undefined;
      const cells: string[] = [];
      const cstyles: number[] = [];
      const cellRe = /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g;
      let cm: RegExpExecArray | null;
      let nextCol = 0;
      while ((cm = cellRe.exec(rm[2] || ''))) {
        const a = parseAttrs(cm[1]);
        const col = a.r ? colIndex(a.r) : nextCol;
        nextCol = col + 1;
        if (col >= MAX_COLS) {
          truncated = true;
          continue;
        }
        const body = cm[2] || '';
        const v = body.match(/<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/);
        const raw = v ? decodeEntities(v[1]) : '';
        let text = '';
        if (a.t === 's') text = shared[Number(raw)] ?? '';
        else if (a.t === 'inlineStr') {
          const parts = body.match(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g) || [];
          text = parts.map((p) => decodeEntities(p.replace(/<[^>]+>/g, ''))).join('');
        } else if (a.t === 'b') text = raw === '1' ? 'VERDADEIRO' : 'FALSO';
        else if (a.t === 'str' || a.t === 'e') text = raw;
        else if (raw !== '') text = formatNumber(Number(raw), styleFormats[Number(a.s || 0)], date1904);
        else {
          // Fórmula sem resultado salvo: mostra a fórmula
          const f = body.match(/<(?:\w+:)?f\b[^>]*>([\s\S]*?)<\/(?:\w+:)?f>/);
          if (f) text = '=' + decodeEntities(f[1]);
        }
        const si = a.s !== undefined ? styleOf(Number(a.s)) : -1;
        if (text !== '' || si >= 0) {
          while (cells.length < col) cells.push('');
          while (cstyles.length < col) cstyles.push(-1);
          cells[col] = text;
          cstyles[col] = si;
          if (text !== '' || xfStyle[Number(a.s)]?.bg || xfStyle[Number(a.s)]?.bt || xfStyle[Number(a.s)]?.bb) maxCol = Math.max(maxCol, col + 1);
        }
      }
      // Linha com formatação própria vale para as células vazias dela
      if (rowStyle !== undefined) {
        const rs = styleOf(rowStyle);
        if (rs >= 0) for (let c = 0; c < Math.max(cstyles.length, maxCol); c++) if (cstyles[c] === undefined || cstyles[c] === -1) cstyles[c] = rs;
      }
      while (rows.length < rowIdx) rows.push([]);
      while (cellStyleRows.length < rowIdx) cellStyleRows.push([]);
      rows[rowIdx] = cells;
      cellStyleRows[rowIdx] = cstyles;
    }
    for (const m of merges) maxCol = Math.max(maxCol, m.c + m.cs);
    // remove linhas vazias do fim (sem texto e sem formatação)
    while (rows.length && !rows[rows.length - 1].some((c) => c) && !(cellStyleRows[rows.length - 1] || []).some((x) => x >= 0)) {
      rows.pop();
      cellStyleRows.pop();
    }
    // Colunas com estilo próprio (ex.: coluna inteira pintada) valem para células sem estilo
    if (colStyle.length) {
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < maxCol; c++) {
          if (colStyle[c] !== undefined && (cellStyleRows[r][c] === undefined || cellStyleRows[r][c] === -1)) {
            const cs = styleOf(colStyle[c]);
            if (cs >= 0) cellStyleRows[r][c] = cs;
          }
        }
      }
    }
    sheets.push({
      name: sh.attrs.name || `Planilha ${sheets.length + 1}`,
      rows,
      totalRows,
      totalCols: maxCol,
      truncated,
      styles: styleList,
      cellStyles: cellStyleRows,
      colWidths: Array.from({ length: maxCol }, (_, c) => colWidths[c] ?? defaultColPx),
      rowHeights: Array.from({ length: rows.length }, (_, r) => rowHeights[r] ?? defaultRowPx),
      merges,
      showGrid,
    });
  }
  if (!sheets.length) throw new Error('Nenhuma planilha visível neste arquivo.');
  return { sheets };
}

// ------------------------------------------------------------------ WORD
export type DocRun = { text?: string; b?: boolean; i?: boolean; u?: boolean; s?: boolean; href?: string; img?: string; imgAlt?: string; br?: boolean };
export type DocBlock =
  | { t: 'p'; style?: string; align?: string; list?: { level: number; ordered: boolean }; runs: DocRun[] }
  | { t: 'table'; rows: Array<Array<{ span: number; blocks: DocBlock[] }>> };

const MAX_BLOCKS = 20000;
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);

export async function previewDocx(filePath: string): Promise<{ blocks: DocBlock[]; images: string[]; truncated: boolean }> {
  const { entries } = await listZip(filePath);
  const read = (name: string) => readZipText(filePath, entries, name);
  const docXml = await read('word/document.xml');
  if (!docXml) throw new Error('Documento inválido (sem word/document.xml). Se for um .doc antigo, baixe o arquivo.');
  const rels = relsMap(await read('word/_rels/document.xml.rels'));

  // Estilos: id → nome (para reconhecer títulos em qualquer idioma)
  const styleName = new Map<string, string>();
  // Estilos de lista (ex.: "Marcador"/"List Bullet") trazem a numeração no próprio estilo
  const styleNum = new Map<string, { numId: string; level: number }>();
  const stylesXml = await read('word/styles.xml');
  if (stylesXml) {
    for (const st of kids(find(parseXml(stylesXml), 'styles'), 'style')) {
      const id = attr(st, 'styleId');
      const name = attr(kid(st, 'name'), 'val');
      if (id && name) styleName.set(id, name);
      const numPr = kid(kid(st, 'pPr'), 'numPr');
      const numId = attr(kid(numPr, 'numId'), 'val');
      if (id && numId) styleNum.set(id, { numId, level: Number(attr(kid(numPr, 'ilvl'), 'val') || 0) });
    }
  }
  const headingOf = (styleId?: string): string | undefined => {
    if (!styleId) return undefined;
    const name = (styleName.get(styleId) || styleId).toLowerCase();
    if (name === 'title' || name === 'título' || name === 'titulo') return 'title';
    if (name === 'subtitle' || name === 'subtítulo' || name === 'subtitulo') return 'subtitle';
    const m = name.match(/^(?:heading|título|titulo|ttulo)\s*(\d)$/i) || styleId.match(/^(?:Heading|Ttulo|Titulo)(\d)$/i);
    return m ? `h${Math.min(6, Number(m[1]))}` : undefined;
  };

  // Listas: numId → nível → numerada ou marcador
  const numbering = new Map<string, Map<number, boolean>>();
  const numXml = await read('word/numbering.xml');
  if (numXml) {
    const tree = find(parseXml(numXml), 'numbering');
    const abstract = new Map<string, Map<number, boolean>>();
    for (const an of kids(tree, 'abstractNum')) {
      const levels = new Map<number, boolean>();
      for (const lvl of kids(an, 'lvl')) levels.set(Number(attr(lvl, 'ilvl') || 0), (attr(kid(lvl, 'numFmt'), 'val') || 'bullet') !== 'bullet');
      abstract.set(attr(an, 'abstractNumId') || '', levels);
    }
    for (const num of kids(tree, 'num')) {
      numbering.set(attr(num, 'numId') || '', abstract.get(attr(kid(num, 'abstractNumId'), 'val') || '') || new Map());
    }
  }

  const images = new Set<string>();
  let count = 0;
  let truncated = false;

  const onOff = (n: XNode | undefined) => (n ? !['0', 'false', 'none'].includes(String(attr(n, 'val') ?? '1')) : false);

  const runsOf = (container: XNode, href?: string): DocRun[] => {
    const out: DocRun[] = [];
    for (const c of kids(container)) {
      const name = local(c.name);
      if (name === 'r') {
        const rPr = kid(c, 'rPr');
        const fmt = {
          b: onOff(kid(rPr, 'b')) || undefined,
          i: onOff(kid(rPr, 'i')) || undefined,
          u: (kid(rPr, 'u') && attr(kid(rPr, 'u'), 'val') !== 'none') || undefined,
          s: onOff(kid(rPr, 'strike')) || undefined,
        };
        for (const part of kids(c)) {
          const pn = local(part.name);
          if (pn === 't') out.push({ text: textOf(part), ...fmt, href });
          else if (pn === 'tab') out.push({ text: '\t', ...fmt });
          else if (pn === 'br' || pn === 'cr') out.push({ br: true });
          else if (pn === 'drawing' || pn === 'pict' || pn === 'object') {
            const blip = find(part, 'blip') || find(part, 'imagedata');
            const rid = attr(blip, 'embed') || attr(blip, 'id');
            const rel = rid ? rels.get(rid) : undefined;
            const docPr = find(part, 'docPr');
            if (rel && !rel.external) {
              const target = resolvePart('word', rel.target);
              const ext = target.split('.').pop()!.toLowerCase();
              if (IMAGE_EXTS.has(ext)) {
                images.add(target);
                out.push({ img: target, imgAlt: attr(docPr, 'descr') || attr(docPr, 'name') || '' });
              } else out.push({ text: '[imagem]' });
            }
          }
        }
      } else if (name === 'hyperlink') {
        const rel = rels.get(attr(c, 'id') || '');
        const link = rel?.external && /^(https?:|mailto:)/i.test(rel.target) ? rel.target : undefined;
        out.push(...runsOf(c, link));
      } else if (name === 'ins' || name === 'smartTag' || name === 'sdt' || name === 'sdtContent' || name === 'fldSimple') {
        out.push(...runsOf(name === 'sdt' ? kid(c, 'sdtContent') || c : c, href));
      }
    }
    return out;
  };

  const blocksOf = (container: XNode | undefined): DocBlock[] => {
    const out: DocBlock[] = [];
    for (const c of kids(container)) {
      if (count >= MAX_BLOCKS) {
        truncated = true;
        break;
      }
      const name = local(c.name);
      if (name === 'p') {
        count++;
        const pPr = kid(c, 'pPr');
        const styleId = attr(kid(pPr, 'pStyle'), 'val');
        const numPr = kid(pPr, 'numPr');
        const fromStyle = styleId ? styleNum.get(styleId) : undefined;
        const numId = attr(kid(numPr, 'numId'), 'val') || fromStyle?.numId;
        const level = Number(attr(kid(numPr, 'ilvl'), 'val') ?? fromStyle?.level ?? 0) || 0;
        const align = attr(kid(pPr, 'jc'), 'val');
        const block: DocBlock = { t: 'p', runs: runsOf(c) };
        const heading = headingOf(styleId);
        if (heading) block.style = heading;
        if (align && ['center', 'right', 'both', 'end'].includes(align)) block.align = align === 'both' ? 'justify' : align === 'end' ? 'right' : align;
        if (numId && numId !== '0') block.list = { level, ordered: numbering.get(numId)?.get(level) ?? false };
        out.push(block);
      } else if (name === 'tbl') {
        count++;
        const rows = kids(c, 'tr').map((tr) =>
          kids(tr, 'tc').map((tc) => ({
            span: Number(attr(kid(kid(tc, 'tcPr'), 'gridSpan'), 'val') || 1) || 1,
            blocks: blocksOf(tc),
          }))
        );
        out.push({ t: 'table', rows });
      } else if (name === 'sdt') {
        out.push(...blocksOf(kid(c, 'sdtContent')));
      } else if (name === 'customXml' || name === 'ins') {
        out.push(...blocksOf(c));
      }
    }
    return out;
  };

  const body = find(parseXml(docXml), 'body');
  const blocks = blocksOf(body);
  return { blocks, images: [...images], truncated };
}

/** Imagem de dentro do .docx (só as que o documento usa, só formatos de imagem comuns) */
export async function docxImage(filePath: string, partName: string): Promise<{ data: Buffer; ext: string } | null> {
  const ext = partName.split('.').pop()!.toLowerCase();
  if (!IMAGE_EXTS.has(ext) || !partName.startsWith('word/') || partName.includes('..')) return null;
  const { entries } = await listZip(filePath);
  const entry: ZipEntry | undefined = entries.find((e) => e.name === partName);
  if (!entry) return null;
  const { extractZipEntry } = await import('./zipReader');
  const data = await extractZipEntry(filePath, entry, { maxBytes: 30 * 1024 * 1024 });
  return data ? { data, ext } : null;
}
