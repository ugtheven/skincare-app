import type { RecognizedPackagingText } from '@/data/on-device-text-recognition';

export type ParsedProductIngredient = {
  name: string;
  normalizedName: string;
  position: number;
};

const ingredientMarker =
  /(?:^|[\s\-–—])(?:ingredients?|ingr[ée]dients?|ingredientes?|ingredienti|inci|bestanddele|ingredienser|ainesosat|składniki)\s*[:\-–—]\s*/i;

const inlineStop =
  /\s*[([]?\s*(?:code\s+f\.?\s*i\.?\s*l\.?|distribution\b|distributed\b|made\s+in\b|fabriqu[ée]\b|service\s+consommateur\b|consumer\s+service\b|https?:\/\/|www\.).*$/i;

const lineStop =
  /^\s*(?:\d+(?:[.,]\d+)?\s*(?:ml|cl|fl\.?\s*oz)\b|distribution\b|distributed\b|made\s+in\b|fabriqu[ée]\b|service\s+consommateur\b|consumer\s+service\b|responsible\s+person\b|www\.|https?:\/\/)/i;

const commonInciTokens = new Set([
  'alcohol',
  'aqua',
  'carbomer',
  'ceramide',
  'dimethicone',
  'glycerin',
  'glycol',
  'parfum',
  'phenoxyethanol',
  'sodium',
  'tocopherol',
  'water',
]);

function cleanIngredientText(value: string) {
  return value
    .replace(inlineStop, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:;,.\-–—]+|[\s:;,\-–—]+$/g, '')
    .trim();
}

export function normalizeIngredientName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function splitIngredientItems(value: string) {
  const items: string[] = [];
  let current = '';
  let depth = 0;

  for (const character of value) {
    if (character === '(' || character === '[') depth += 1;
    if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    if ((character === ',' || character === ';') && depth === 0) {
      items.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  items.push(current);
  return items;
}

export function parseIngredientList(value: string): ParsedProductIngredient[] {
  const withoutMarker = value.replace(ingredientMarker, '');
  const cleaned = cleanIngredientText(withoutMarker);
  const seen = new Set<string>();

  return splitIngredientItems(cleaned)
    .map((item) => item.replace(/^[•·*\-–—\s]+/, '').trim())
    .filter(Boolean)
    .flatMap((name) => {
      const normalizedName = normalizeIngredientName(name);
      if (!normalizedName || seen.has(normalizedName)) return [];
      seen.add(normalizedName);
      return [{ name, normalizedName }];
    })
    .map((ingredient, position) => ({ ...ingredient, position }));
}

function looksLikeIngredientList(value: string, hasMarker: boolean) {
  const items = value
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const knownTokens = value
    .toLocaleLowerCase('en-US')
    .split(/[^a-z]+/)
    .filter((token) => commonInciTokens.has(token)).length;
  return (
    value.length >= 20 &&
    (items.length >= (hasMarker ? 3 : 5) || knownTokens >= (hasMarker ? 2 : 4))
  );
}

function extractAfterMarker(lines: string[]) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = ingredientMarker.exec(lines[index]);
    if (!match) continue;

    const collected = [lines[index].slice(match.index + match[0].length)];
    for (const line of lines.slice(index + 1)) {
      if (lineStop.test(line)) break;
      collected.push(line);
      if (inlineStop.test(line)) break;
    }
    const text = cleanIngredientText(collected.join(' '));
    if (looksLikeIngredientList(text, true)) return text;
  }
  return '';
}

function extractCommaDenseBlock(lines: string[]) {
  let best = '';
  let active: string[] = [];

  const commit = () => {
    const candidate = cleanIngredientText(active.join(' '));
    if (
      candidate.length > best.length &&
      looksLikeIngredientList(candidate, false)
    ) {
      best = candidate;
    }
    active = [];
  };

  for (const line of lines) {
    const commaCount = (line.match(/,/g) ?? []).length;
    const uppercaseRatio =
      (line.match(/[A-Z]/g) ?? []).length / Math.max(1, line.length);
    const ingredientLike =
      commaCount >= 2 || (active.length > 0 && uppercaseRatio >= 0.35);
    if (ingredientLike && !lineStop.test(line)) active.push(line);
    else commit();
  }
  commit();
  return best;
}

export function extractIngredientListFromPackagingText(
  recognized: Pick<RecognizedPackagingText, 'lines' | 'text'>,
) {
  const lines = recognized.lines.length
    ? recognized.lines
    : recognized.text.split(/\r?\n/);
  return extractAfterMarker(lines) || extractCommaDenseBlock(lines);
}
