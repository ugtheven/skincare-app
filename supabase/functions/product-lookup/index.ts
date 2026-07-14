import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';

import { controlledProductCategory } from '../_shared/product-category.ts';
import {
  ensureNormalizedProductImage,
  normalizeSourceImage,
  type NormalizedProductImage,
} from '../_shared/product-image.ts';
import { persistStructuredFormula } from '../_shared/product-ingredients.ts';
import {
  criticalProductVariantsMatch,
  type ApprovedDomain,
} from '../_shared/visual-lookup.ts';
import { discoverManufacturerPage } from '../_shared/manufacturer-discovery.ts';
import { isValidGtin } from '../_shared/product-identifier.ts';

declare const EdgeRuntime: {
  waitUntil(promise: Promise<unknown>): void;
};

type ProductRow = {
  id: string;
  canonical_name: string;
  brand: string | null;
  category: string | null;
  image_url: string | null;
  product_aliases?: { alias: string }[];
  product_formulas?: {
    ingredients_text: string;
    source_provider: string;
    source_url: string | null;
    confidence: number;
    status: string;
  }[];
};

const corsHeaders = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function normalize(value: string) {
  const compact = value.trim().replace(/\s+/g, '');
  return /^\d+$/.test(compact)
    ? compact
    : compact.replace(/\/$/, '').toLocaleUpperCase('en-US');
}

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function sitemapManufacturerEnrichment(
  admin: SupabaseClient<any>,
  input: { productId: string; brand: string; name: string },
) {
  const { data: domains } = await admin
    .from('brand_source_domains')
    .select('domain, brand, source_kind, license, license_url');
  const page = await discoverManufacturerPage(
    (domains ?? []) as ApprovedDomain[],
    input.brand,
    input.name,
  );
  if (!page) return null;
  if (page.ingredientsText) {
    await persistStructuredFormula(admin, {
      productId: input.productId,
      ingredientsText: page.ingredientsText,
      sourceProvider: page.brand,
      sourceUrl: page.sourceUrl,
      confidence: 85,
    });
  }
  const image = await normalizeSourceImage(
    admin,
    {
      domain: page.sourceDomain,
      sourceKind: page.sourceKind,
      sourceUrl: page.imageUrl,
      sourcePageUrl: page.sourceUrl,
      sourceName: page.brand,
      license: page.sourceLicense,
      licenseUrl: page.sourceLicenseUrl,
    },
    input.productId,
  );
  await admin.from('product_sources').upsert(
    {
      product_id: input.productId,
      provider: 'manufacturer_sitemap',
      provider_product_id: page.sourceUrl,
      source_url: page.sourceUrl,
      license: page.sourceLicense,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'provider,provider_product_id' },
  );
  return {
    image,
    ingredientsText: page.ingredientsText,
    name: page.name,
    sourceUrl: page.sourceUrl,
  };
}

function textTokens(value: string) {
  const ignored = new Set([
    'am',
    'and',
    'avec',
    'aux',
    'for',
    'le',
    'les',
    'ml',
    'pm',
    'pour',
    'skin',
    'soin',
    'the',
    'visage',
  ]);
  const normalized = normalizeText(value).replace(
    /\bspf\s+(\d{1,3})\b/g,
    'spf$1',
  );
  return [...new Set(normalized.split(' '))]
    .filter(
      (token) =>
        token.length >= 2 &&
        !ignored.has(token) &&
        !/^\d+(?:ml|g)?$/.test(token),
    )
    .slice(0, 12);
}

function compactText(value: string) {
  return normalizeText(value).replace(/\s+/g, '');
}

function scoreTextMatch(value: string, product: ProductRow) {
  const queryTokens = textTokens(value);
  if (!queryTokens.length) return 0;

  return Math.max(
    ...[
      product.canonical_name,
      ...(product.product_aliases ?? []).map(({ alias }) => alias),
    ].map((name) => {
      if (!criticalProductVariantsMatch(value, name)) return 0;
      const candidate = [product.brand, name].filter(Boolean).join(' ');
      const candidateTokens = textTokens(candidate);
      if (!candidateTokens.length) return 0;
      const matches = candidateTokens.filter((candidateToken) =>
        queryTokens.some(
          (queryToken) =>
            queryToken === candidateToken ||
            (queryToken.length >= 4 &&
              (queryToken.includes(candidateToken) ||
                candidateToken.includes(queryToken))),
        ),
      ).length;
      const phraseBonus = compactText(value).includes(compactText(candidate))
        ? 0.15
        : 0;
      return Math.min(
        1,
        Number(
          (
            (matches / candidateTokens.length) * 0.7 +
            (matches / queryTokens.length) * 0.15 +
            phraseBonus
          ).toFixed(3),
        ),
      );
    }),
  );
}

function toResponse(
  product: ProductRow,
  score?: number,
  image?: NormalizedProductImage | null,
) {
  const formula = (product.product_formulas ?? [])
    .filter(({ status }) => status === 'approved')
    .sort((left, right) => right.confidence - left.confidence)[0];
  return {
    id: product.id,
    name: product.canonical_name,
    brand: product.brand,
    category: controlledProductCategory(
      product.category,
      product.canonical_name,
    ),
    imageUrl: image?.imageUrl ?? product.image_url,
    imageSource: image?.imageSource ?? null,
    imageSourceUrl: image?.imageSourceUrl ?? null,
    imageLicense: image?.imageLicense ?? null,
    imageLicenseUrl: image?.imageLicenseUrl ?? null,
    ingredientsText: formula?.ingredients_text ?? null,
    ingredientsSource: formula?.source_provider ?? null,
    ingredientsSourceUrl: formula?.source_url ?? null,
    ...(score === undefined ? {} : { score }),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return Response.json(
      { error: 'method_not_allowed' },
      { status: 405, headers: corsHeaders },
    );
  }

  const { mode, value } = await request.json().catch(() => ({}));
  if (
    (mode !== 'identifier' &&
      mode !== 'identifier_refresh' &&
      mode !== 'text') ||
    typeof value !== 'string' ||
    !value.trim()
  ) {
    return Response.json(
      { error: 'invalid_request' },
      { status: 400, headers: corsHeaders },
    );
  }
  const refreshOnly = mode === 'identifier_refresh';

  const authorization = request.headers.get('Authorization');
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );
  const auth = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
      '',
  );
  const token = authorization?.replace(/^Bearer\s+/i, '');
  const {
    data: { user },
  } = token ? await auth.auth.getUser(token) : { data: { user: null } };
  if (!user) {
    return Response.json(
      { error: 'authentication_required' },
      { status: 401, headers: corsHeaders },
    );
  }
  const query = normalize(value);

  if (mode === 'text') {
    const terms = textTokens(value).map(compactText).filter(Boolean);
    if (!terms.length) {
      return Response.json({ matches: [] }, { headers: corsHeaders });
    }
    const filters = terms.flatMap((term) => [
      `normalized_name.ilike.%${term}%`,
      `normalized_brand.ilike.%${term}%`,
    ]);
    const aliasFilters = terms.map(
      (term) => `normalized_alias.ilike.%${term}%`,
    );
    const productSelection =
      'id, canonical_name, brand, category, image_url, product_aliases(alias), product_formulas(ingredients_text, source_provider, source_url, confidence, status)';
    const [productResult, aliasResult] = await Promise.all([
      admin
        .from('products')
        .select(productSelection)
        .or(filters.join(','))
        .limit(30),
      admin
        .from('product_aliases')
        .select(`product:products(${productSelection})`)
        .or(aliasFilters.join(','))
        .limit(30),
    ]);
    if (productResult.error || aliasResult.error) {
      return Response.json(
        { error: 'lookup_failed' },
        { status: 500, headers: corsHeaders },
      );
    }
    const products = new Map<string, ProductRow>();
    for (const product of productResult.data ?? []) {
      products.set(product.id, product as ProductRow);
    }
    for (const row of aliasResult.data ?? []) {
      const product = row.product as unknown as ProductRow | null;
      if (product) products.set(product.id, product);
    }
    const ranked = [...products.values()]
      .map((product) => ({ product, score: scoreTextMatch(value, product) }))
      .filter(({ score }) => score >= 0.35)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    const matches = await Promise.all(
      ranked.map(async ({ product, score }) => {
        const image = await ensureNormalizedProductImage(admin, product);
        return toResponse(product, score, image);
      }),
    );
    return Response.json({ matches }, { headers: corsHeaders });
  }

  const { data: cached } = await admin
    .from('lookup_cache')
    .select('product_id, result_kind')
    .eq('lookup_key', `identifier:${query}`)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  const { data: identifier, error: identifierError } = await admin
    .from('product_identifiers')
    .select(
      'product:products(id, canonical_name, brand, category, image_url, product_formulas(ingredients_text, source_provider, source_url, confidence, status))',
    )
    .eq('normalized_value', query)
    .maybeSingle();
  if (identifierError) {
    return Response.json(
      { error: 'lookup_failed' },
      { status: 500, headers: corsHeaders },
    );
  }

  const existingProduct = (identifier?.product ??
    null) as unknown as ProductRow | null;
  if (existingProduct) {
    const image = await ensureNormalizedProductImage(
      admin,
      existingProduct,
      query,
      undefined,
      refreshOnly !== true,
    );
    const hasApprovedFormula = (existingProduct.product_formulas ?? []).some(
      ({ status }) => status === 'approved',
    );
    if (
      !refreshOnly &&
      existingProduct.brand &&
      (!image || !hasApprovedFormula)
    ) {
      EdgeRuntime.waitUntil(
        sitemapManufacturerEnrichment(admin, {
          productId: existingProduct.id,
          brand: existingProduct.brand,
          name: existingProduct.canonical_name,
        }).catch(() => undefined),
      );
    }
    return Response.json(
      { matches: [toResponse(existingProduct, undefined, image)] },
      { headers: corsHeaders },
    );
  }
  if (!isValidGtin(query)) {
    return Response.json({ matches: [] }, { headers: corsHeaders });
  }
  if (cached?.result_kind === 'miss') {
    return Response.json({ matches: [] }, { headers: corsHeaders });
  }

  const upstream = await fetch(
    `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(
      query,
    )}.json?product_type=all&fields=product_name,product_name_fr,brands,categories,image_front_url,image_url,ingredients_text,ingredients_text_fr,lc,countries_tags,product_type`,
    {
      headers: {
        'User-Agent':
          Deno.env.get('OPEN_BEAUTY_FACTS_USER_AGENT') ?? 'SkincareApp/1.0',
      },
      signal: AbortSignal.timeout(8_000),
    },
  );
  if (upstream.status === 404) {
    await admin.from('lookup_cache').upsert({
      lookup_key: `identifier:${query}`,
      result_kind: 'miss',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return Response.json({ matches: [] }, { headers: corsHeaders });
  }
  if (!upstream.ok) {
    return Response.json(
      { error: 'provider_unavailable' },
      { status: 503, headers: corsHeaders },
    );
  }

  const payload = await upstream.json();
  const productName =
    payload?.status === 'success' && payload?.result?.id === 'product_found'
      ? payload?.product?.product_name_fr?.trim() ||
        payload?.product?.product_name?.trim()
      : '';
  if (!productName) {
    await admin.from('lookup_cache').upsert({
      lookup_key: `identifier:${query}`,
      result_kind: 'miss',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    return Response.json({ matches: [] }, { headers: corsHeaders });
  }

  const normalizedName = compactText(productName);
  const normalizedBrand = payload.product.brands
    ? compactText(payload.product.brands)
    : '';
  const identityQuery = admin
    .from('products')
    .select('id, canonical_name, brand, category, image_url')
    .eq('normalized_name', normalizedName);
  const { data: existingIdentity } = await (
    normalizedBrand
      ? identityQuery.eq('normalized_brand', normalizedBrand)
      : identityQuery.is('normalized_brand', null)
  ).maybeSingle();
  const productResult = existingIdentity
    ? { data: existingIdentity, error: null }
    : await admin
        .from('products')
        .insert({
          canonical_name: productName,
          normalized_name: normalizedName,
          brand: payload.product.brands?.trim() || null,
          normalized_brand: normalizedBrand || null,
          category: controlledProductCategory(
            payload.product.categories?.split(',')[0]?.trim() || null,
            productName,
          ),
          image_url: null,
          confidence: 70,
        })
        .select('id, canonical_name, brand, category, image_url')
        .single();
  const product = productResult.data;
  if (productResult.error || !product) {
    return Response.json(
      { error: 'lookup_failed' },
      { status: 500, headers: corsHeaders },
    );
  }
  const responseProduct: ProductRow = {
    ...product,
    product_formulas: [],
  };

  await admin.from('product_identifiers').insert({
    product_id: product.id,
    kind: 'barcode',
    raw_value: value.trim(),
    normalized_value: query,
  });
  await admin.from('product_sources').upsert(
    {
      product_id: product.id,
      provider: `open_${payload.product.product_type ?? 'beauty'}_facts`,
      provider_product_id: query,
      source_url: `https://world.openfoodfacts.org/product/${query}`,
      license: 'ODbL-1.0',
    },
    { onConflict: 'provider,provider_product_id' },
  );
  const ingredientsText =
    payload.product.ingredients_text_fr?.trim() ||
    payload.product.ingredients_text?.trim() ||
    '';
  if (ingredientsText) {
    const sourceUrl = `https://world.openbeautyfacts.org/product/${query}`;
    const sourceProvider = `open_${payload.product.product_type ?? 'beauty'}_facts`;
    await persistStructuredFormula(admin, {
      productId: product.id,
      ingredientsText,
      sourceProvider,
      sourceUrl,
      confidence: 70,
    });
    responseProduct.product_formulas = [
      {
        ingredients_text: ingredientsText,
        source_provider: sourceProvider,
        source_url: sourceUrl,
        confidence: 70,
        status: 'approved',
      },
    ];
  }
  await admin.from('lookup_cache').upsert({
    lookup_key: `identifier:${query}`,
    product_id: product.id,
    result_kind: 'match',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const upstreamImageUrl =
    payload.product.image_front_url || payload.product.image_url || '';
  EdgeRuntime.waitUntil(
    (async () => {
      const manufacturer = await sitemapManufacturerEnrichment(admin, {
        productId: product.id,
        brand: payload.product.brands?.trim() || '',
        name: productName,
      });
      if (manufacturer?.name && manufacturer.name !== product.canonical_name) {
        await admin.from('product_aliases').upsert(
          {
            product_id: product.id,
            alias: product.canonical_name,
            normalized_alias: compactText(product.canonical_name),
            confidence: 80,
          },
          { onConflict: 'product_id,normalized_alias' },
        );
        await admin
          .from('products')
          .update({
            canonical_name: manufacturer.name,
            normalized_name: compactText(manufacturer.name),
            updated_at: new Date().toISOString(),
          })
          .eq('id', product.id);
      }
      if (!manufacturer?.image) {
        await ensureNormalizedProductImage(
          admin,
          responseProduct,
          query,
          upstreamImageUrl || null,
        );
      }
    })().catch(() => undefined),
  );

  return Response.json(
    { matches: [toResponse(responseProduct)] },
    { headers: corsHeaders },
  );
});
