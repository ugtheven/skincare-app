import { fetchProductPage } from './product-ingredients.ts';
import {
  type ApprovedDomain,
  matchingApprovedDomain,
  normalizeWebText,
} from './visual-lookup.ts';

const ignoredTokens = new Set([
  'daily',
  'face',
  'facial',
  'for',
  'les',
  'nos',
  'product',
  'products',
  'produit',
  'produits',
  'skin',
]);

function tokens(value: string) {
  const aliases: Record<string, string[]> = {
    balm: ['baume'],
    cleanser: ['nettoyant'],
    cleansing: ['nettoyant'],
    cream: ['creme'],
    eye: ['yeux'],
    foaming: ['moussant'],
    lotion: ['lait'],
    moisturizer: ['hydratant'],
    moisturizing: ['hydratant'],
    oil: ['huile'],
    sunscreen: ['solaire'],
  };
  const raw = normalizeWebText(value)
    .replace(/\bspf\s+(\d+)\b/g, 'spf$1')
    .split(' ');
  return [
    ...new Set(raw.flatMap((token) => [token, ...(aliases[token] ?? [])])),
  ].filter((token) => token.length >= 3 && !ignoredTokens.has(token));
}

export function rankManufacturerUrls(urls: string[], query: string) {
  const queryTokens = tokens(query);
  return urls
    .flatMap((url) => {
      let path = '';
      try {
        path = decodeURIComponent(new URL(url).pathname);
      } catch {
        return [];
      }
      if (!/(?:product|produit|nos-produits)/i.test(path)) return [];
      const pathTokens = tokens(path);
      const matches = queryTokens.filter((token) =>
        pathTokens.some(
          (pathToken) =>
            pathToken === token ||
            (token.length >= 5 &&
              (pathToken.includes(token) || token.includes(pathToken))),
        ),
      ).length;
      if (matches < Math.min(2, queryTokens.length)) return [];
      return [{ matches, url }];
    })
    .sort(
      (left, right) =>
        right.matches - left.matches || left.url.length - right.url.length,
    )
    .map(({ url }) => url);
}

export function manufacturerSitemapUrls(domain: string) {
  const normalized = domain.toLocaleLowerCase('en-US').replace(/^www\./, '');
  return [
    `https://www.${normalized}/sitemap.xml`,
    `https://${normalized}/sitemap.xml`,
  ];
}

async function sitemapUrls(domain: string) {
  for (const sitemapUrl of manufacturerSitemapUrls(domain)) {
    const response = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'SkincareApp/1.0 product data enrichment' },
      signal: AbortSignal.timeout(6_000),
    }).catch(() => null);
    if (!response?.ok) continue;
    const xml = (await response.text()).slice(0, 2_000_000);
    const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)].map((match) =>
      match[1].replace(/&amp;/g, '&').trim(),
    );
    if (urls.length) return urls;
  }
  return [];
}

export async function discoverManufacturerPage(
  approvedDomains: ApprovedDomain[],
  brand: string,
  query: string,
) {
  const normalizedBrand = normalizeWebText(brand);
  const domains = approvedDomains.filter(
    (domain) =>
      domain.source_kind === 'manufacturer' &&
      normalizeWebText(domain.brand) === normalizedBrand,
  );
  for (const domain of domains.slice(0, 3)) {
    const ranked = rankManufacturerUrls(
      await sitemapUrls(domain.domain),
      query,
    );
    for (const sourceUrl of ranked.slice(0, 3)) {
      const page = await fetchProductPage(sourceUrl);
      if (!page?.imageUrl) continue;
      const imageDomain = matchingApprovedDomain(
        page.imageUrl,
        approvedDomains,
      );
      if (
        !imageDomain ||
        normalizeWebText(imageDomain.brand) !== normalizedBrand
      ) {
        continue;
      }
      const title = page.title.split('|')[0]?.trim();
      if (!title) continue;
      return {
        brand: domain.brand,
        imageUrl: page.imageUrl,
        ingredientsText: page.ingredientsText,
        name: title,
        sourceDomain: imageDomain.domain,
        sourceKind: imageDomain.source_kind,
        sourceLicense: imageDomain.license,
        sourceLicenseUrl: imageDomain.license_url,
        sourceUrl,
      };
    }
  }
  return null;
}
