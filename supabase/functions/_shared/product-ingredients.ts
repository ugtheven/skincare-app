import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type StructuredIngredient = {
  name: string;
  normalizedName: string;
  position: number;
};

const ingredientMarker =
  /(?:ingredients?|ingr[ée]dients?|ingredientes?|ingredienti|inci)\s*[:\-–—]\s*/i;

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
    reg: '®',
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&([a-z]+);/gi, (entity, name) => named[name] ?? entity);
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

function splitOutsideParentheses(value: string) {
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

export function parseIngredientList(value: string): StructuredIngredient[] {
  const marker = ingredientMarker.exec(value);
  const marked = marker ? value.slice(marker.index + marker[0].length) : value;
  const cleaned = decodeHtml(marked)
    .replace(/\s*\(?\s*(?:code\s+)?f\.?\s*i\.?\s*l\.?.*$/i, '')
    .replace(
      /\s*(?:please note|veuillez noter|la liste des ingrédients peut).*$/i,
      '',
    )
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const seen = new Set<string>();

  return splitOutsideParentheses(cleaned)
    .map((item) => item.replace(/^[•·*\-–—\s]+|[.\s]+$/g, '').trim())
    .filter(Boolean)
    .flatMap((name) => {
      const normalizedName = normalizeIngredientName(name);
      if (!normalizedName || seen.has(normalizedName)) return [];
      seen.add(normalizedName);
      return [{ name, normalizedName }];
    })
    .map((ingredient, position) => ({ ...ingredient, position }));
}

function jsonStringValues(document: string) {
  const values: string[] = [];
  const patterns = [
    /"(?:ingredients?|ingredientsText|inci)"\s*:\s*"((?:\\.|[^"\\]){20,20000})"/gi,
    /"name"\s*:\s*"Ingredients"\s*,\s*"value"\s*:\s*"((?:\\.|[^"\\]){20,20000})"/gi,
  ];
  for (const pattern of patterns) {
    for (const match of document.matchAll(pattern)) {
      try {
        values.push(JSON.parse(`"${match[1]}"`));
      } catch {
        values.push(match[1]);
      }
    }
  }
  return values;
}

export function extractIngredientListFromDocument(document: string) {
  const visibleText = decodeHtml(
    document
      .replace(/<(?:br|\/p|\/div|\/li|\/section)>/gi, '\n')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
  const candidates = [...jsonStringValues(document), visibleText];
  for (const candidate of candidates) {
    const marker = ingredientMarker.exec(candidate);
    if (!marker) continue;
    const parsed = parseIngredientList(candidate.slice(marker.index));
    if (parsed.length >= 3 && parsed.length <= 100) {
      return parsed.map(({ name }) => name).join(', ');
    }
  }
  return '';
}

function metaContent(document: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const propertyFirst = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const contentFirst = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
    'i',
  );
  return decodeHtml(
    propertyFirst.exec(document)?.[1] ?? contentFirst.exec(document)?.[1] ?? '',
  ).trim();
}

export function extractProductPageData(document: string, sourceUrl: string) {
  const imageValue = metaContent(document, 'og:image');
  let imageUrl = '';
  try {
    imageUrl = imageValue ? new URL(imageValue, sourceUrl).toString() : '';
  } catch {
    imageUrl = '';
  }
  return {
    imageUrl,
    ingredientsText: extractIngredientListFromDocument(document),
    title: metaContent(document, 'og:title'),
  };
}

export async function fetchProductPage(sourceUrl: string) {
  const response = await fetch(sourceUrl, {
    headers: { 'User-Agent': 'SkincareApp/1.0 product data enrichment' },
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('html') && !contentType.includes('json')) {
    return null;
  }
  return extractProductPageData(
    (await response.text()).slice(0, 2_000_000),
    sourceUrl,
  );
}

export async function fetchIngredientList(sourceUrl: string) {
  return (await fetchProductPage(sourceUrl))?.ingredientsText ?? '';
}

export async function persistStructuredFormula(
  admin: SupabaseClient,
  input: {
    productId: string;
    ingredientsText: string;
    sourceProvider: string;
    sourceUrl: string | null;
    confidence: number;
  },
) {
  const parsed = parseIngredientList(input.ingredientsText);
  if (parsed.length < 3) return null;

  const { data: existing } = await admin
    .from('product_formulas')
    .select('id')
    .eq('product_id', input.productId)
    .eq('source_provider', input.sourceProvider)
    .eq('source_url', input.sourceUrl)
    .maybeSingle();
  const formulaValues = {
    ingredients_text: parsed.map(({ name }) => name).join(', '),
    normalized_ingredients: parsed
      .map(({ normalizedName }) => normalizedName)
      .join(','),
    source_provider: input.sourceProvider,
    source_url: input.sourceUrl,
    confidence: input.confidence,
    status: 'approved',
    fetched_at: new Date().toISOString(),
  };
  const formulaResult = existing
    ? await admin
        .from('product_formulas')
        .update(formulaValues)
        .eq('id', existing.id)
        .select('id')
        .single()
    : await admin
        .from('product_formulas')
        .insert({ product_id: input.productId, ...formulaValues })
        .select('id')
        .single();
  if (formulaResult.error || !formulaResult.data) return null;

  await admin.from('ingredients').upsert(
    parsed.map(({ name, normalizedName }) => ({
      canonical_name: name,
      normalized_name: normalizedName,
      review_status: 'pending',
    })),
    { ignoreDuplicates: true, onConflict: 'normalized_name' },
  );
  const { data: ingredients } = await admin
    .from('ingredients')
    .select('id, normalized_name')
    .in(
      'normalized_name',
      parsed.map(({ normalizedName }) => normalizedName),
    );
  const ingredientIds = new Map(
    (ingredients ?? []).map(({ id, normalized_name }) => [normalized_name, id]),
  );
  await admin
    .from('product_formula_ingredients')
    .delete()
    .eq('formula_id', formulaResult.data.id);
  await admin.from('product_formula_ingredients').insert(
    parsed.flatMap(({ name, normalizedName, position }) => {
      const ingredientId = ingredientIds.get(normalizedName);
      return ingredientId
        ? [
            {
              formula_id: formulaResult.data.id,
              ingredient_id: ingredientId,
              position,
              raw_name: name,
            },
          ]
        : [];
    }),
  );
  return formulaResult.data.id as string;
}
