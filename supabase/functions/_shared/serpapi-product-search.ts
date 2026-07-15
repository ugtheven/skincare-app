import {
  type ApprovedDomain,
  type DiscoveryDomain,
  matchingApprovedDomain,
  normalizeWebText,
  visualProductIdentityOverlap,
  type VisualWebCandidate,
} from './visual-lookup.ts';

type SerpApiImageResult = {
  position?: number;
  title?: string;
  link?: string;
  original?: string;
};

export type SerpApiImagesPayload = {
  error?: string;
  images_results?: SerpApiImageResult[];
};

export class SerpApiSearchError extends Error {
  constructor(
    public readonly code: 'authentication' | 'quota' | 'provider' | 'timeout',
  ) {
    super(code);
    this.name = 'SerpApiSearchError';
  }
}

function stableId(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function cleanTitle(value: string, brand: string) {
  const title = value
    .replace(/\s+[|–—]\s+.*$/, '')
    .replace(/\s+-\s+[^-]+$/, '')
    .trim();
  const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title
    .replace(new RegExp(`^${escapedBrand}\\s*[-:–—]?\\s*`, 'i'), '')
    .replace(new RegExp(`\\s*[-:–—]?\\s*${escapedBrand}$`, 'i'), '')
    .trim();
}

function approvedSearchDomains(domains: string[]) {
  return [
    ...new Set(
      domains
        .map((domain) =>
          domain.toLocaleLowerCase('en-US').replace(/^www\./, ''),
        )
        .filter((domain) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)),
    ),
  ].slice(0, 3);
}

export function serpApiGoogleImagesUrl(
  apiKey: string,
  query: string,
  manufacturerDomains: string[] = [],
) {
  const url = new URL('https://serpapi.com/search.json');
  const domains = approvedSearchDomains(manufacturerDomains);
  const domainScope = domains.length
    ? ` (${domains.map((domain) => `site:${domain}`).join(' OR ')})`
    : '';
  url.searchParams.set('engine', 'google_images');
  url.searchParams.set('q', `${query}${domainScope}`.slice(0, 240));
  url.searchParams.set('hl', 'fr');
  url.searchParams.set('gl', 'fr');
  url.searchParams.set('safe', 'active');
  url.searchParams.set('api_key', apiKey);
  return url;
}

export function candidatesFromSerpApiImages(
  payload: SerpApiImagesPayload,
  approvedDomains: ApprovedDomain[],
  query: string,
): VisualWebCandidate[] {
  const normalizedQuery = normalizeWebText(query);
  const recognizedBrands = approvedDomains.filter(
    ({ brand, source_kind }) =>
      source_kind === 'manufacturer' &&
      normalizedQuery.includes(normalizeWebText(brand)),
  );
  if (!recognizedBrands.length) return [];

  const candidates = (payload.images_results ?? []).flatMap((result) => {
    if (!result.link || !result.original || !result.title) return [];
    const pageSource = matchingApprovedDomain(result.link, approvedDomains);
    const imageSource = matchingApprovedDomain(
      result.original,
      approvedDomains,
    );
    if (
      !pageSource ||
      !imageSource ||
      pageSource.source_kind !== 'manufacturer' ||
      imageSource.source_kind !== 'manufacturer' ||
      normalizeWebText(pageSource.brand) !==
        normalizeWebText(imageSource.brand) ||
      !recognizedBrands.some(
        ({ brand }) =>
          normalizeWebText(brand) === normalizeWebText(pageSource.brand),
      )
    ) {
      return [];
    }

    const resultName = cleanTitle(result.title, pageSource.brand);
    const sourcePath = new URL(result.link).pathname;
    const titleOverlap = visualProductIdentityOverlap(
      query,
      resultName,
      pageSource.brand,
    );
    const overlap = Math.max(
      titleOverlap,
      visualProductIdentityOverlap(
        query,
        `${resultName} ${sourcePath}`,
        pageSource.brand,
      ),
    );
    const name =
      titleOverlap > 0 ? resultName : cleanTitle(query, pageSource.brand);
    if (!name || overlap <= 0) return [];
    const positionPenalty = Math.min(0.08, ((result.position ?? 1) - 1) * 0.01);

    return [
      {
        id: `serpapi-images:${stableId(result.link)}`,
        name,
        brand: pageSource.brand,
        category: null,
        imageUrl: result.original,
        sourceUrl: result.link,
        sourceDomain: pageSource.domain,
        sourceKind: pageSource.source_kind,
        sourceLicense: pageSource.license,
        sourceLicenseUrl: pageSource.license_url,
        score: Number(
          Math.max(0.72, 0.92 * overlap - positionPenalty).toFixed(3),
        ),
      },
    ];
  });

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

export function retailerIdentityHintsFromSerpApiImages(
  payload: SerpApiImagesPayload,
  discoveryDomains: DiscoveryDomain[],
  recognizedBrand: string,
) {
  const normalizedBrand = normalizeWebText(recognizedBrand);
  if (!normalizedBrand) return [];
  const hints = (payload.images_results ?? []).flatMap((result) => {
    if (!result.link || !result.title) return [];
    let host = '';
    try {
      const url = new URL(result.link);
      if (url.protocol !== 'https:') return [];
      host = url.hostname.toLocaleLowerCase('en-US').replace(/^www\./, '');
    } catch {
      return [];
    }
    if (
      !discoveryDomains.some(
        ({ domain }) =>
          host === domain.toLocaleLowerCase('en-US') ||
          host.endsWith(`.${domain.toLocaleLowerCase('en-US')}`),
      ) ||
      !normalizeWebText(result.title).includes(normalizedBrand)
    ) {
      return [];
    }
    return [result.title.trim().slice(0, 240)];
  });
  return [...new Set(hints)].slice(0, 5);
}

export async function searchSerpApiProductImages(
  apiKey: string,
  query: string,
  approvedDomains: ApprovedDomain[],
  discoveryDomains: DiscoveryDomain[] = [],
  recognizedBrand = '',
) {
  if (!query.trim()) return { candidates: [], retailerHints: [] };
  const normalizedBrand = normalizeWebText(recognizedBrand);
  const manufacturerDomains = approvedDomains
    .filter(
      ({ brand, source_kind }) =>
        source_kind === 'manufacturer' &&
        normalizeWebText(brand) === normalizedBrand,
    )
    .map(({ domain }) => domain);
  let response: Response;
  try {
    response = await fetch(
      serpApiGoogleImagesUrl(apiKey, query, manufacturerDomains),
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      },
    );
  } catch {
    throw new SerpApiSearchError('timeout');
  }
  if (!response.ok) {
    throw new SerpApiSearchError(
      response.status === 401 || response.status === 403
        ? 'authentication'
        : response.status === 429
          ? 'quota'
          : 'provider',
    );
  }
  const payload = (await response.json()) as SerpApiImagesPayload;
  if (payload.error) {
    throw new SerpApiSearchError(
      /api key|account|authenticate|unauthorized/i.test(payload.error)
        ? 'authentication'
        : /credit|limit|quota|searches/i.test(payload.error)
          ? 'quota'
          : 'provider',
    );
  }
  return {
    candidates: candidatesFromSerpApiImages(payload, approvedDomains, query),
    retailerHints: retailerIdentityHintsFromSerpApiImages(
      payload,
      discoveryDomains,
      recognizedBrand,
    ),
  };
}
