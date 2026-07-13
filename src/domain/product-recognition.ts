import {
  emptyProductDraft,
  PRODUCT_CATEGORIES,
  type ProductDraft,
} from './product';

export type ProductCandidate = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  imageSourceUrl?: string | null;
  imageSource?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
  ingredientsText?: string | null;
  ingredientsSource?: string | null;
  ingredientsSourceUrl?: string | null;
  score: number;
  source: 'local' | 'shared' | 'open-beauty-facts' | 'google-web';
};

export type RecognizedProductTextLine = {
  text: string;
  confidence?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type RecognizedProductTextInput = string | RecognizedProductTextLine;

const CATEGORY_RULES: readonly {
  category: string;
  terms: string[];
}[] = [
  {
    category: 'Soin capillaire',
    terms: [
      'serum cheveux',
      'hair serum',
      'cuir chevelu',
      'hair density',
      'hair loss',
    ],
  },
  {
    category: 'Coiffant',
    terms: ['pate argileuse', 'styling paste', 'matifiante'],
  },
  {
    category: 'Protection solaire',
    terms: ['sunscreen', 'sun screen', 'solaire', 'spf'],
  },
  {
    category: 'Soin contour des yeux',
    terms: ['contour des yeux', 'eye cream', 'eye serum', 'under eye'],
  },
  {
    category: 'Démaquillant',
    terms: ['demaquillant', 'makeup remover', 'make up remover', 'micellaire'],
  },
  {
    category: 'Nettoyant',
    terms: [
      'cleanser',
      'cleansing',
      'face wash',
      'facial wash',
      'gel moussant',
      'nettoyant',
    ],
  },
  {
    category: 'Exfoliant',
    terms: ['exfoliant', 'exfoliating', 'peeling', 'scrub', 'gommage'],
  },
  { category: 'Masque', terms: ['masque', 'mask'] },
  { category: 'Tonique', terms: ['toner', 'tonique', 'essence'] },
  { category: 'Sérum', terms: ['serum'] },
  {
    category: 'Soin ciblé',
    terms: ['anti imperfections', 'anti blemish', 'blemish', 'spot treatment'],
  },
  {
    category: 'Hydratant',
    terms: [
      'hydratant',
      'hydratante',
      'hydrating',
      'lait hydratant',
      'locion hidratante',
      'locao hidratante',
      'moisturizer',
      'moisturiser',
      'moisturizing',
      'moisturising',
      'moisturising lotion',
      'urea repair',
      'face cream',
      'facial cream',
      'creme visage',
    ],
  },
];

const PACKAGING_WORDS = new Set([
  'avec',
  'and',
  'aux',
  'de',
  'des',
  'du',
  'for',
  'le',
  'les',
  'ml',
  'new',
  'pour',
  'skin',
  'soin',
  'the',
  'visage',
]);

export function normalizeProductText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\bspf\s+(\d+)\b/g, 'spf$1');
}

export function productTextTokens(value: string): string[] {
  const tokens = normalizeProductText(value).split(' ').filter(Boolean);
  return [...new Set(tokens)].filter(
    (token) =>
      token.length >= 2 &&
      !PACKAGING_WORDS.has(token) &&
      (!/^\d+(?:ml|g)?$/.test(token) || /^\d{5,14}$/.test(token)),
  );
}

export function textLookupQuery(value: string): string {
  return productTextTokens(value).slice(0, 16).join(' ');
}

export function inferProductCategory(value: string): string {
  const normalized = normalizeProductText(value);
  return (
    CATEGORY_RULES.find(({ terms }) =>
      terms.some((term) => normalized.includes(normalizeProductText(term))),
    )?.category ?? ''
  );
}

export function normalizeProductCategory(
  value: string | null | undefined,
  productText = '',
): string {
  const normalizedValue = normalizeProductText(value ?? '');
  const exact = PRODUCT_CATEGORIES.find(
    (category) => normalizeProductText(category) === normalizedValue,
  );
  if (exact) return exact;

  const aliases: Record<string, string> = {
    hydratants: 'Hydratant',
    moisturizers: 'Hydratant',
    moisturisers: 'Hydratant',
    cleansers: 'Nettoyant',
    serums: 'Sérum',
    sunscreens: 'Protection solaire',
  };
  const aliased = aliases[normalizedValue];
  if (aliased) return aliased;

  return inferProductCategory(`${value ?? ''} ${productText}`);
}

function cleanRecognizedLine(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function recognizedLine(
  value: RecognizedProductTextInput,
): RecognizedProductTextLine {
  return typeof value === 'string' ? { text: value } : value;
}

function isLineOnProduct(line: RecognizedProductTextLine): boolean {
  if (line.confidence !== undefined && line.confidence < 0.4) return false;
  if (line.x === undefined || line.width === undefined) return true;
  const center = line.x + line.width / 2;
  return center >= 0.15 && center <= 0.85;
}

function cleanRecognizedBrand(value: string): string {
  const cleaned = cleanRecognizedLine(value).replace(/\s*[=–—]\s*/g, '-');
  const canonicalBrands: Record<string, string> = {
    'aroma zone': 'AROMA-ZONE',
    cerave: 'CeraVe',
    eucerin: 'Eucerin',
    schwarzkopf: 'Schwarzkopf',
  };
  return canonicalBrands[normalizeProductText(cleaned)] ?? cleaned;
}

function isPackagingDetailLine(value: string): boolean {
  const normalized = normalizeProductText(value);
  return (
    /^(avec|effet|effect|fabrique|for|made|peau|pour|skin)\b/.test(
      normalized,
    ) || /^(\d+)\s*(g|kg|ml|cl|l)\b/.test(normalized)
  );
}

type ProductNameKind =
  | 'cream'
  | 'eye'
  | 'hair-serum'
  | 'lotion'
  | 'milk'
  | 'paste'
  | 'serum'
  | 'urea-lotion';

const PRODUCT_NAME_RULES: readonly {
  kind: ProductNameKind;
  pattern: RegExp;
  priority: number;
}[] = [
  { kind: 'eye', pattern: /\bcontour des yeux\b/, priority: 130 },
  { kind: 'hair-serum', pattern: /\bserum cheveux\b/, priority: 125 },
  { kind: 'paste', pattern: /\bpate argileuse\b/, priority: 120 },
  { kind: 'urea-lotion', pattern: /^urea repair\b/, priority: 118 },
  { kind: 'milk', pattern: /^lait\b/, priority: 115 },
  { kind: 'cream', pattern: /^creme\b/, priority: 110 },
  { kind: 'serum', pattern: /^serum\b/, priority: 105 },
  {
    kind: 'lotion',
    pattern: /^(?:locion hidratante|locao hidratante)/,
    priority: 100,
  },
  { kind: 'lotion', pattern: /^lotion\b/, priority: 80 },
];

function cleanNamePart(value: string): string {
  return cleanRecognizedLine(value).replace(/^[^\p{L}\p{N}]+/u, '');
}

function lineIncludes(value: string, pattern: RegExp): boolean {
  return pattern.test(normalizeProductText(value));
}

function buildRecognizedProductName(
  entries: RecognizedProductTextLine[],
  brandIndex: number,
): string {
  const afterBrand = entries.slice(brandIndex + 1, brandIndex + 22);
  const matches = afterBrand.flatMap((line, index) => {
    const normalized = normalizeProductText(line.text);
    return PRODUCT_NAME_RULES.filter(({ pattern }) =>
      pattern.test(normalized),
    ).map((rule) => ({ ...rule, index }));
  });
  const match = matches.sort(
    (left, right) => right.priority - left.priority || left.index - right.index,
  )[0];
  if (!match) {
    return cleanNamePart(
      afterBrand.find((line) => !isPackagingDetailLine(line.text))?.text ?? '',
    );
  }

  const current = cleanNamePart(afterBrand[match.index].text);
  const before = afterBrand[match.index - 1]?.text ?? '';
  const beforeTwo = afterBrand[match.index - 2]?.text ?? '';
  const after = afterBrand[match.index + 1]?.text ?? '';
  const afterTwo = afterBrand[match.index + 2]?.text ?? '';
  const afterThree = afterBrand[match.index + 3]?.text ?? '';

  if (match.kind === 'eye') {
    const cream = [before, beforeTwo].find((line) =>
      lineIncludes(line, /^creme\b/),
    );
    return [cream ? cleanNamePart(cream) : '', current]
      .filter(Boolean)
      .join(' ');
  }

  if (match.kind === 'hair-serum') {
    const nearbyActiveLines = [beforeTwo, before, after, afterTwo].filter(
      (line) => lineIncludes(line, /peptide|extrait|extract/),
    );
    const activesLine =
      nearbyActiveLines.find((line) =>
        lineIncludes(line, /extraits? de|pois/),
      ) ?? nearbyActiveLines[0];
    const actives = activesLine ? cleanNamePart(activesLine) : '';
    return [current, actives ? `- ${actives}` : ''].filter(Boolean).join(' ');
  }

  if (match.kind === 'paste') {
    const finish = lineIncludes(before, /matifiante|matte/)
      ? cleanNamePart(before)
      : '';
    return [current, finish].filter(Boolean).join(' ');
  }

  if (match.kind === 'milk') {
    const benefit = lineIncludes(after, /hydratant|moistur/)
      ? cleanNamePart(after)
      : '';
    return [current, benefit].filter(Boolean).join(' ');
  }

  if (match.kind === 'urea-lotion') {
    const lotionIndex = afterBrand.findIndex((line) =>
      lineIncludes(line.text, /^(?:locion hidratante|locao hidratante)/),
    );
    const lotion = afterBrand[lotionIndex]?.text ?? current;
    const previous = afterBrand[lotionIndex - 1]?.text ?? '';
    const concentration = lineIncludes(
      previous,
      /intensiv|\d+\s*(?:urea|ureia)/,
    )
      ? cleanNamePart(previous)
      : '';
    return [cleanNamePart(lotion), concentration].filter(Boolean).join(' ');
  }

  if (match.kind === 'cream') {
    const nearby = [beforeTwo, before, after, afterTwo, afterThree];
    const hydration = nearby.find((line) =>
      lineIncludes(line, /^hydratant(?:e)?$/),
    );
    const face = nearby.find((line) => lineIncludes(line, /^visage$/));
    const variant = nearby.find((line) =>
      lineIncludes(line, /\b(?:am|pm|spf\s*\d+)\b/),
    );
    return [
      current,
      hydration ? cleanNamePart(hydration) : '',
      face ? cleanNamePart(face) : '',
      variant ? cleanNamePart(variant).replace(/\s+/g, ' ') : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (match.kind === 'serum') {
    const selectedOnlyType = normalizeProductText(current) === 'serum';
    return [
      current,
      selectedOnlyType && !isPackagingDetailLine(before)
        ? cleanNamePart(before)
        : '',
      !isPackagingDetailLine(after) ? cleanNamePart(after) : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const concentration = lineIncludes(before, /intensiv|\d+\s*(?:urea|ureia)/)
    ? cleanNamePart(before)
    : '';
  return [current, concentration].filter(Boolean).join(' ');
}

function recognizedIdentityLines(lines: RecognizedProductTextInput[]): {
  brand: string;
  name: string;
} {
  const usefulLines = lines
    .map(recognizedLine)
    .map((line) => ({ ...line, text: cleanRecognizedLine(line.text) }))
    .filter(
      (line) =>
        isLineOnProduct(line) && /[a-z]/.test(normalizeProductText(line.text)),
    );
  const brandIndex = usefulLines.findIndex(
    (line) => !isPackagingDetailLine(line.text),
  );
  const brand = cleanRecognizedBrand(usefulLines[brandIndex]?.text ?? '');
  const name = buildRecognizedProductName(usefulLines, brandIndex);

  return { brand, name };
}

export function productLookupTextFromRecognizedText(
  text: string,
  lines: RecognizedProductTextInput[] = text.split(/\r?\n/),
): string {
  const identity = recognizedIdentityLines(lines);
  return [identity.brand, identity.name].filter(Boolean).join(' ');
}

const GENERIC_IDENTITY_TOKENS = new Set([
  'concentre',
  'concentree',
  'cream',
  'creme',
  'gel',
  'hydratant',
  'hydratante',
  'lait',
  'lotion',
  'naturel',
  'naturelle',
  'serum',
]);

function candidateMatchEvidence(text: string, candidate: ProductCandidate) {
  const queryTokens = productTextTokens(text);
  const brandTokens = productTextTokens(candidate.brand ?? '');
  const candidateNameTokens = productTextTokens(candidate.name);
  if (!queryTokens.length || !candidateNameTokens.length) {
    return {
      brandCoverage: 0,
      identityMatches: 0,
      phraseMatches: false,
      queryIdentityCount: 0,
      score: 0,
    };
  }
  const tokenMatches = (left: string, right: string) =>
    left === right ||
    (left.length >= 4 &&
      right.length >= 4 &&
      (left.includes(right) || right.includes(left)));
  const matchingCount = (source: string[], target: string[]) =>
    source.filter((sourceToken) =>
      target.some((targetToken) => tokenMatches(sourceToken, targetToken)),
    ).length;

  const queryNameTokens = queryTokens.filter(
    (token) =>
      !/^\d{5,14}$/.test(token) &&
      !brandTokens.some((brandToken) => tokenMatches(token, brandToken)),
  );
  const queryIdentityTokens = queryNameTokens.filter(
    (token) => !GENERIC_IDENTITY_TOKENS.has(token),
  );
  const candidateIdentityTokens = candidateNameTokens.filter(
    (token) => !GENERIC_IDENTITY_TOKENS.has(token),
  );
  const brandCoverage = brandTokens.length
    ? matchingCount(brandTokens, queryTokens) / brandTokens.length
    : 0;
  const nameQueryCoverage = queryNameTokens.length
    ? matchingCount(queryNameTokens, candidateNameTokens) /
      queryNameTokens.length
    : 0;
  const nameCandidateCoverage = candidateNameTokens.length
    ? matchingCount(candidateNameTokens, queryNameTokens) /
      candidateNameTokens.length
    : 0;
  const identityQueryCoverage = queryIdentityTokens.length
    ? matchingCount(queryIdentityTokens, candidateIdentityTokens) /
      queryIdentityTokens.length
    : 0;
  const identityCandidateCoverage = candidateIdentityTokens.length
    ? matchingCount(candidateIdentityTokens, queryIdentityTokens) /
      candidateIdentityTokens.length
    : 0;
  const compactQueryName = queryNameTokens.join('');
  const compactCandidateName = candidateNameTokens.join('');
  const phraseMatches =
    compactQueryName.length > 0 &&
    (compactQueryName.includes(compactCandidateName) ||
      compactCandidateName.includes(compactQueryName));
  const phraseBonus = phraseMatches
    ? queryIdentityTokens.length
      ? 0.08
      : 0.4
    : 0;

  const score = Math.min(
    1,
    Number(
      (
        brandCoverage * 0.18 +
        nameQueryCoverage * 0.22 +
        nameCandidateCoverage * 0.12 +
        identityQueryCoverage * 0.28 +
        identityCandidateCoverage * 0.12 +
        phraseBonus
      ).toFixed(3),
    ),
  );
  return {
    brandCoverage,
    identityMatches: matchingCount(
      queryIdentityTokens,
      candidateIdentityTokens,
    ),
    phraseMatches,
    queryIdentityCount: queryIdentityTokens.length,
    score,
  };
}

function scoreCandidate(text: string, candidate: ProductCandidate): number {
  return candidateMatchEvidence(text, candidate).score;
}

export function isProductCandidateCompatible(
  text: string,
  candidate: ProductCandidate,
) {
  const evidence = candidateMatchEvidence(text, candidate);
  if (evidence.brandCoverage < 0.5) return false;
  if (!evidence.queryIdentityCount) return evidence.phraseMatches;
  return (
    evidence.identityMatches >= Math.min(2, evidence.queryIdentityCount) &&
    evidence.score >= 0.35
  );
}

export function selectProductCandidates(
  text: string,
  candidates: ProductCandidate[],
  limit = 3,
): ProductCandidate[] {
  const seen = new Set<string>();
  return candidates
    .map((candidate) => {
      const textScore = scoreCandidate(text, candidate);
      return {
        ...candidate,
        score: Math.max(textScore, Math.min(candidate.score, textScore + 0.08)),
      };
    })
    .filter(
      (candidate) =>
        candidate.score >= 0.35 &&
        isProductCandidateCompatible(text, candidate),
    )
    .sort(
      (left, right) =>
        right.score - left.score || left.name.localeCompare(right.name),
    )
    .filter((candidate) => {
      const key = normalizeProductText(
        [candidate.brand, candidate.name].filter(Boolean).join(' '),
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

export function hasReliableCandidate(candidates: ProductCandidate[]): boolean {
  return (candidates[0]?.score ?? 0) >= 0.72;
}

export function hasDecisiveCandidate(candidates: ProductCandidate[]): boolean {
  const first = candidates[0]?.score ?? 0;
  const second = candidates[1]?.score ?? 0;
  return first >= 0.84 && first - second >= 0.18;
}

export function isProductCandidateComplete(
  candidate: ProductCandidate,
): boolean {
  return Boolean(
    candidate.name.trim() &&
    candidate.brand?.trim() &&
    candidate.category?.trim() &&
    candidate.imageUrl?.trim() &&
    candidate.ingredientsText?.trim() &&
    candidate.ingredientsSource?.trim(),
  );
}

export function hasProductCandidateImage(candidate: ProductCandidate): boolean {
  return Boolean(candidate.imageUrl?.trim());
}

export function candidateToDraft(candidate: ProductCandidate): ProductDraft {
  return {
    ...emptyProductDraft,
    name: candidate.name,
    brand: candidate.brand ?? '',
    category:
      normalizeProductCategory(
        candidate.category,
        [candidate.brand, candidate.name].join(' '),
      ) || 'Autre',
    imageUrl: candidate.imageUrl ?? '',
    imageSource: candidate.imageSource ?? '',
    imageSourceUrl: candidate.imageSourceUrl ?? '',
    imageLicense: candidate.imageLicense ?? '',
    imageLicenseUrl: candidate.imageLicenseUrl ?? '',
    ingredientsText: candidate.ingredientsText ?? '',
    ingredientsSource: candidate.ingredientsSource ?? '',
    ingredientsSourceUrl: candidate.ingredientsSourceUrl ?? '',
  };
}

export function manualDraftFromRecognizedText(
  text: string,
  lines: RecognizedProductTextInput[] = text.split(/\r?\n/),
): ProductDraft {
  const identity = recognizedIdentityLines(lines);

  if (identity.name) {
    return {
      ...emptyProductDraft,
      brand: identity.brand,
      name: identity.name,
      category: inferProductCategory(text),
    };
  }

  return {
    ...emptyProductDraft,
    name: identity.brand,
    category: inferProductCategory(text),
  };
}
