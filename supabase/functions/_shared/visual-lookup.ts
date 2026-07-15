export type ApprovedDomain = {
  domain: string;
  brand: string;
  source_kind: 'manufacturer' | 'licensed_catalogue';
  license: string | null;
  license_url: string | null;
};

export type DiscoveryDomain = {
  domain: string;
  source_kind: 'retailer' | 'pharmacy';
};

export type WebImage = { url?: string; score?: number };
export type WebPage = {
  url?: string;
  pageTitle?: string;
  score?: number;
  fullMatchingImages?: WebImage[];
  partialMatchingImages?: WebImage[];
};
export type WebDetection = {
  bestGuessLabels?: { label?: string }[];
  webEntities?: { description?: string; score?: number }[];
  pagesWithMatchingImages?: WebPage[];
};

export type VisualWebCandidate = {
  id: string;
  name: string;
  brand: string;
  category: null;
  imageUrl: string | null;
  sourceUrl: string;
  sourceDomain: string;
  sourceKind: 'manufacturer' | 'licensed_catalogue';
  sourceLicense: string | null;
  sourceLicenseUrl: string | null;
  score: number;
};

export type StoredProductDiscovery = {
  fingerprint: string;
  proposedName: string;
  proposedBrand: string | null;
  sourcePageUrl: string | null;
  normalizedImageUrl: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  productImage: {
    sourceDomain: string;
    sourceKind: 'manufacturer' | 'licensed_catalogue';
    license: string | null;
    licenseUrl: string | null;
  } | null;
};

export function normalizeWebText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function criticalProductVariants(value: string) {
  const normalized = normalizeWebText(value).replace(
    /\bspf\s+(\d{1,3})\b/g,
    'spf$1',
  );
  const spf = [...normalized.matchAll(/\bspf(\d{1,3})\b/g)].map(
    ([, level]) => `spf${Number(level)}`,
  );
  const percentages = [
    ...value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .matchAll(/\b(\d+(?:[.,]\d+)?)\s*%/g),
  ].map(([, amount]) => `pct${amount.replace(',', '.')}`);
  return [...new Set([...spf, ...percentages])].sort();
}

export function criticalProductVariantsMatch(
  query: string,
  candidateName: string,
) {
  const queryVariants = criticalProductVariants(query);
  const candidateVariants = criticalProductVariants(candidateName);
  const querySpf = queryVariants.filter((variant) => variant.startsWith('spf'));
  const candidateSpf = candidateVariants.filter((variant) =>
    variant.startsWith('spf'),
  );
  const queryPercentages = queryVariants.filter((variant) =>
    variant.startsWith('pct'),
  );
  const candidatePercentages = candidateVariants.filter((variant) =>
    variant.startsWith('pct'),
  );
  return (
    querySpf.length === candidateSpf.length &&
    querySpf.every((variant, index) => candidateSpf[index] === variant) &&
    (!queryPercentages.length ||
      (queryPercentages.length === candidatePercentages.length &&
        queryPercentages.every(
          (variant, index) => candidatePercentages[index] === variant,
        )))
  );
}

const genericProductTokens = new Set([
  'am',
  'and',
  'avec',
  'beauty',
  'care',
  'cosmetique',
  'cream',
  'creme',
  'face',
  'facial',
  'gel',
  'lait',
  'lotion',
  'pm',
  'product',
  'produit',
  'serum',
  'skin',
  'soin',
  'the',
  'visage',
]);

function productTokens(value: string, brand = '') {
  const brandTokens = new Set(normalizeWebText(brand).split(' '));
  const normalized = normalizeWebText(value).replace(
    /\bspf\s+(\d{1,3})\b/g,
    'spf$1',
  );
  return [...new Set(normalized.split(' '))].filter(
    (token) =>
      token.length >= 2 &&
      !genericProductTokens.has(token) &&
      !brandTokens.has(token),
  );
}

function differsByAtMostOneCharacter(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;
  let leftIndex = 0;
  let rightIndex = 0;
  let differences = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    differences += 1;
    if (differences > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return (
    differences +
      Number(leftIndex < left.length || rightIndex < right.length) <=
    1
  );
}

function productTokenMatches(left: string, right: string) {
  if (left === right) return true;
  if (
    left.length >= 5 &&
    right.length >= 5 &&
    (left.includes(right) || right.includes(left))
  ) {
    return true;
  }
  return (
    left.length >= 6 &&
    right.length >= 6 &&
    differsByAtMostOneCharacter(left, right)
  );
}

export function visualProductIdentityOverlap(
  query: string,
  candidate: string,
  brand: string,
) {
  if (!criticalProductVariantsMatch(query, candidate)) return 0;
  const queryTokens = productTokens(query, brand);
  const candidateTokens = productTokens(candidate, brand);
  const shared = queryTokens.filter((queryToken) =>
    candidateTokens.some((candidateToken) =>
      productTokenMatches(queryToken, candidateToken),
    ),
  );
  const minimumShared = Math.min(2, queryTokens.length);
  if (!minimumShared || shared.length < minimumShared) return 0;
  return Math.min(
    1,
    shared.length /
      Math.max(2, Math.min(queryTokens.length, candidateTokens.length)),
  );
}

function hostname(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return null;
    return url.hostname.toLocaleLowerCase('en-US').replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function matchingApprovedDomain(
  value: string,
  approvedDomains: ApprovedDomain[],
) {
  const host = hostname(value);
  if (!host) return null;
  return (
    approvedDomains.find(
      ({ domain }) =>
        host === domain.toLocaleLowerCase('en-US') ||
        host.endsWith(`.${domain.toLocaleLowerCase('en-US')}`),
    ) ?? null
  );
}

export function candidatesFromStoredDiscoveries(
  discoveries: StoredProductDiscovery[],
  query: string,
  approvedDomains: ApprovedDomain[],
): VisualWebCandidate[] {
  return discoveries
    .flatMap((discovery) => {
      if (
        discovery.status === 'rejected' ||
        !discovery.proposedBrand ||
        !discovery.sourcePageUrl ||
        !discovery.normalizedImageUrl ||
        !discovery.productImage
      ) {
        return [];
      }
      const pageSource = matchingApprovedDomain(
        discovery.sourcePageUrl,
        approvedDomains,
      );
      const imageSource = approvedDomains.find(
        ({ brand, domain, source_kind }) =>
          source_kind === discovery.productImage?.sourceKind &&
          normalizeWebText(brand) ===
            normalizeWebText(discovery.proposedBrand ?? '') &&
          domain.toLocaleLowerCase('en-US') ===
            discovery.productImage?.sourceDomain.toLocaleLowerCase('en-US'),
      );
      if (
        !pageSource ||
        !imageSource ||
        normalizeWebText(pageSource.brand) !==
          normalizeWebText(discovery.proposedBrand)
      ) {
        return [];
      }
      const overlap = visualProductIdentityOverlap(
        query,
        discovery.proposedName,
        discovery.proposedBrand,
      );
      if (overlap <= 0) return [];
      return [
        {
          id: discovery.fingerprint,
          name: discovery.proposedName,
          brand: discovery.proposedBrand,
          category: null,
          imageUrl: discovery.normalizedImageUrl,
          sourceUrl: discovery.sourcePageUrl,
          sourceDomain: imageSource.domain,
          sourceKind: imageSource.source_kind,
          sourceLicense: discovery.productImage.license,
          sourceLicenseUrl: discovery.productImage.licenseUrl,
          score: Number(Math.max(0.78, overlap * 0.92).toFixed(3)),
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

export function retailerIdentityHintsFromWebDetection(
  detection: WebDetection,
  discoveryDomains: DiscoveryDomain[],
  recognizedBrand: string,
) {
  const normalizedBrand = normalizeWebText(recognizedBrand);
  if (!normalizedBrand) return [];

  const hints = (detection.pagesWithMatchingImages ?? []).flatMap((page) => {
    if (!page.url || !page.pageTitle) return [];
    const host = hostname(page.url);
    if (
      !host ||
      !discoveryDomains.some(
        ({ domain }) =>
          host === domain.toLocaleLowerCase('en-US') ||
          host.endsWith(`.${domain.toLocaleLowerCase('en-US')}`),
      )
    ) {
      return [];
    }
    const title = page.pageTitle
      .replace(/<[^>]*>/g, ' ')
      .trim()
      .slice(0, 240);
    return normalizeWebText(title).includes(normalizedBrand) ? [title] : [];
  });

  return [...new Set(hints)].slice(0, 5);
}

function cleanPageTitle(title: string, brand: string) {
  const plain = title
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const brandPattern = new RegExp(
    `^${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[-:–—]?\\s*`,
    'i',
  );
  const withoutBrand = plain.replace(brandPattern, '').trim();
  return withoutBrand.split(/\s+[|–—]\s+/)[0]?.trim() ?? withoutBrand;
}

function stableId(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

export function webDetectionSignals(detection: WebDetection) {
  return [
    ...(detection.bestGuessLabels ?? []).map(({ label }) => label ?? ''),
    ...(detection.webEntities ?? []).map(
      ({ description }) => description ?? '',
    ),
    ...(detection.pagesWithMatchingImages ?? []).map(
      ({ pageTitle }) => pageTitle ?? '',
    ),
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(' ')
    .slice(0, 3000);
}

export function candidatesFromWebDetection(
  detection: WebDetection,
  approvedDomains: ApprovedDomain[],
): VisualWebCandidate[] {
  const candidates = (detection.pagesWithMatchingImages ?? []).flatMap(
    (page) => {
      if (!page.url || !page.pageTitle) return [];
      const source = matchingApprovedDomain(page.url, approvedDomains);
      if (!source || source.source_kind !== 'manufacturer') return [];
      const name = cleanPageTitle(page.pageTitle, source.brand);
      if (normalizeWebText(name).length < 3) return [];

      const pageImages = [
        ...(page.fullMatchingImages ?? []),
        ...(page.partialMatchingImages ?? []),
      ];
      const image = pageImages.find(({ url }) => {
        if (!url) return false;
        const imageSource = matchingApprovedDomain(url, approvedDomains);
        return imageSource?.brand === source.brand;
      });
      const score = Math.min(0.95, Math.max(0.55, page.score ?? 0.55));

      return [
        {
          id: `google-web:${stableId(page.url)}`,
          name,
          brand: source.brand,
          category: null,
          imageUrl: image?.url ?? null,
          sourceUrl: page.url,
          sourceDomain: source.domain,
          sourceKind: source.source_kind,
          sourceLicense: source.license,
          sourceLicenseUrl: source.license_url,
          score: Number(score.toFixed(3)),
        },
      ];
    },
  );

  const seen = new Set<string>();
  return candidates
    .sort((left, right) => right.score - left.score)
    .filter((candidate) => {
      const key = normalizeWebText(`${candidate.brand} ${candidate.name}`);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}
