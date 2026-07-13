import type { ProductDraft } from '@/domain/product';
import {
  normalizeProductCategory,
  textLookupQuery,
  type ProductCandidate,
} from '@/domain/product-recognition';

type OpenBeautyFactsResponse = {
  status?: number | string;
  result?: { id?: string };
  product?: {
    code?: string;
    product_name?: string;
    brands?: string;
    categories?: string;
    image_front_url?: string;
    image_url?: string;
    ingredients_text?: string;
    ingredients_text_fr?: string;
  };
};

type OpenBeautyFactsSearchResponse = {
  products?: NonNullable<OpenBeautyFactsResponse['product']>[];
};

const PRODUCT_FIELDS = [
  'product_name',
  'brands',
  'categories',
  'image_front_url',
  'image_url',
  'ingredients_text',
  'ingredients_text_fr',
].join(',');
const LOOKUP_TIMEOUT_MS = 8_000;

function ingredientsText(
  product: NonNullable<OpenBeautyFactsResponse['product']>,
) {
  return (
    product.ingredients_text_fr?.trim() ||
    product.ingredients_text?.trim() ||
    ''
  );
}

export function productDraftFromLookup(
  barcode: string,
  response: OpenBeautyFactsResponse,
): ProductDraft | null {
  const found =
    response.status === 1 ||
    (response.status === 'success' && response.result?.id === 'product_found');
  if (!found || !response.product?.product_name?.trim()) {
    return null;
  }

  return {
    name: response.product.product_name.trim(),
    brand: response.product.brands?.trim() ?? '',
    category:
      normalizeProductCategory(
        response.product.categories?.split(',')[0],
        response.product.product_name,
      ) || 'Autre',
    barcode,
    imageUrl: '',
    imageSource: '',
    imageSourceUrl: '',
    imageLicense: '',
    imageLicenseUrl: '',
    ingredientsText: ingredientsText(response.product),
    ingredientsSource: ingredientsText(response.product)
      ? 'Open Beauty Facts'
      : '',
    ingredientsSourceUrl: ingredientsText(response.product)
      ? `https://world.openbeautyfacts.org/product/${encodeURIComponent(barcode)}`
      : '',
    source: 'barcode',
  };
}

export function productCandidatesFromSearch(
  response: OpenBeautyFactsSearchResponse,
): ProductCandidate[] {
  return (response.products ?? [])
    .filter((product) => product.product_name?.trim())
    .map((product, index) => ({
      id: `open-beauty-facts:${product.code ?? index}`,
      name: product.product_name!.trim(),
      brand: product.brands?.trim() || null,
      category:
        normalizeProductCategory(
          product.categories?.split(',')[0],
          product.product_name!,
        ) || 'Autre',
      imageUrl: null,
      ingredientsText: ingredientsText(product) || null,
      ingredientsSource: ingredientsText(product) ? 'Open Beauty Facts' : null,
      ingredientsSourceUrl:
        ingredientsText(product) && product.code
          ? `https://world.openbeautyfacts.org/product/${encodeURIComponent(product.code)}`
          : null,
      score: 0,
      source: 'open-beauty-facts' as const,
    }));
}

export async function lookupProductByBarcode(
  barcode: string,
): Promise<ProductDraft | null> {
  const url = new URL(
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(barcode)}.json`,
  );
  url.searchParams.set('fields', PRODUCT_FIELDS);
  url.searchParams.set('product_type', 'all');

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SkincareApp/1.0 (local-first product catalogue)',
    },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error('lookup_failed');

  return productDraftFromLookup(
    barcode,
    (await response.json()) as OpenBeautyFactsResponse,
  );
}

export async function lookupOpenBeautyFactsByText(
  recognizedText: string,
): Promise<ProductCandidate[]> {
  const query = textLookupQuery(recognizedText);
  if (!query) return [];

  const url = new URL('https://world.openbeautyfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '8');
  url.searchParams.set('fields', `code,${PRODUCT_FIELDS}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SkincareApp/1.0 (local-first product catalogue)',
    },
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error('lookup_failed');

  return productCandidatesFromSearch(
    (await response.json()) as OpenBeautyFactsSearchResponse,
  );
}
