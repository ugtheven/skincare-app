import {
  createClient,
  type SupabaseClient,
} from 'https://esm.sh/@supabase/supabase-js@2';

import { controlledProductCategory } from '../_shared/product-category.ts';
import {
  consumeGoogleVisionBudget,
  consumeSerpApiBudget,
  recordProviderUsageOutcome,
} from '../_shared/google-vision-budget.ts';
import {
  ensureNormalizedProductImage,
  normalizeSourceImage,
  recordProductDiscovery,
} from '../_shared/product-image.ts';
import {
  fetchIngredientList,
  persistStructuredFormula,
} from '../_shared/product-ingredients.ts';
import { discoverManufacturerPage } from '../_shared/manufacturer-discovery.ts';
import {
  SerpApiSearchError,
  searchSerpApiProductImages,
} from '../_shared/serpapi-product-search.ts';
import {
  type ApprovedDomain,
  candidatesFromWebDetection,
  criticalProductVariantsMatch,
  type DiscoveryDomain,
  normalizeWebText,
  retailerIdentityHintsFromWebDetection,
  type WebDetection,
  webDetectionSignals,
  visualProductIdentityOverlap,
} from '../_shared/visual-lookup.ts';

const corsHeaders = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_BASE64_LENGTH = 1_500_000;

function response(body: unknown, status = 200) {
  return Response.json(body, { status, headers: corsHeaders });
}

function compactText(value: string) {
  return normalizeWebText(value).replace(/\s+/g, '');
}

function safeHostname(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      ? url.hostname.toLocaleLowerCase('en-US').replace(/^www\./, '')
      : null;
  } catch {
    return null;
  }
}

async function persistEnrichedWebCandidate(
  admin: SupabaseClient<any>,
  candidate: ReturnType<typeof candidatesFromWebDetection>[number],
) {
  if (!candidate.imageUrl) return null;
  const normalizedName = compactText(candidate.name);
  const normalizedBrand = compactText(candidate.brand);
  const { data: existing } = await admin
    .from('products')
    .select('id, canonical_name, brand, category')
    .eq('normalized_name', normalizedName)
    .eq('normalized_brand', normalizedBrand)
    .maybeSingle();
  const source = {
    domain: candidate.sourceDomain,
    sourceKind: candidate.sourceKind,
    sourceUrl: candidate.imageUrl,
    sourcePageUrl: candidate.sourceUrl,
    sourceName: candidate.brand,
    license: candidate.sourceLicense,
    licenseUrl: candidate.sourceLicenseUrl,
  } as const;
  const normalizedImage = await normalizeSourceImage(
    admin,
    source,
    existing?.id ?? null,
  );
  if (!normalizedImage) return null;

  const ingredientsText = await fetchIngredientList(candidate.sourceUrl);
  if (existing && ingredientsText) {
    await persistStructuredFormula(admin, {
      productId: existing.id,
      ingredientsText,
      sourceProvider: candidate.brand,
      sourceUrl: candidate.sourceUrl,
      confidence: 85,
    });
  }
  await recordProductDiscovery(admin, candidate, normalizedImage);

  return {
    ...candidate,
    id: existing?.id ?? candidate.id,
    name: existing?.canonical_name ?? candidate.name,
    brand: existing?.brand ?? candidate.brand,
    category: controlledProductCategory(
      existing?.category ?? null,
      existing?.canonical_name ?? candidate.name,
    ),
    imageUrl: normalizedImage.imageUrl,
    imageSource: normalizedImage.imageSource,
    imageSourceUrl: normalizedImage.imageSourceUrl,
    imageLicense: normalizedImage.imageLicense,
    imageLicenseUrl: normalizedImage.imageLicenseUrl,
    ingredientsText: ingredientsText || null,
    ingredientsSource: ingredientsText ? candidate.brand : null,
    ingredientsSourceUrl: ingredientsText ? candidate.sourceUrl : null,
    matchSource: existing ? 'catalogue' : 'google',
  };
}

function manufacturerCandidate(
  page: NonNullable<Awaited<ReturnType<typeof discoverManufacturerPage>>>,
) {
  return {
    id: `manufacturer-sitemap:${compactText(page.sourceUrl)}`,
    name: page.name,
    brand: page.brand,
    category: null,
    imageUrl: page.imageUrl,
    sourceUrl: page.sourceUrl,
    sourceDomain: page.sourceDomain,
    sourceKind: page.sourceKind,
    sourceLicense: page.sourceLicense,
    sourceLicenseUrl: page.sourceLicenseUrl,
    score: 0.78,
  };
}

function textTokens(value: string) {
  const normalized = normalizeWebText(value).replace(
    /\bspf\s+(\d{1,3})\b/g,
    'spf$1',
  );
  return [...new Set(normalized.split(' '))]
    .filter((token) => token.length >= 3 && !/^\d+$/.test(token))
    .slice(0, 16);
}

function scoreProduct(
  value: string,
  product: {
    canonical_name: string;
    brand: string | null;
    product_aliases?: { alias: string }[];
  },
) {
  if (!criticalProductVariantsMatch(value, product.canonical_name)) return 0;
  const queryTokens = textTokens(value);
  if (!queryTokens.length) return 0;
  return Math.max(
    ...[
      product.canonical_name,
      ...(product.product_aliases ?? []).map(({ alias }) => alias),
    ].map((name) => {
      const candidate = [product.brand, name].filter(Boolean).join(' ');
      const candidateTokens = textTokens(candidate);
      if (!candidateTokens.length) return 0;
      const matches = candidateTokens.filter((token) =>
        queryTokens.some(
          (query) =>
            query === token ||
            (query.length >= 4 &&
              (query.includes(token) || token.includes(query))),
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return response({ error: 'method_not_allowed' }, 405);
  }
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
  if (!user) return response({ error: 'authentication_required' }, 401);

  const payload = await request.json().catch(() => ({}));
  const diagnosticsEnabled =
    payload?.diagnostics === true &&
    Deno.env.get('VISUAL_LOOKUP_RUNTIME_ENV') === 'development' &&
    Deno.env.get('ALLOW_UNMETERED_VISUAL_LOOKUP') === 'true';
  const imageBase64 = payload?.imageBase64;
  const requestId =
    typeof payload?.requestId === 'string' &&
    /^[A-Za-z0-9:_-]{8,120}$/.test(payload.requestId)
      ? payload.requestId
      : '';
  const recognizedText =
    typeof payload?.recognizedText === 'string'
      ? payload.recognizedText.slice(0, 3000)
      : '';
  if (
    payload?.mimeType !== 'image/jpeg' ||
    typeof imageBase64 !== 'string' ||
    !requestId ||
    imageBase64.length < 100 ||
    imageBase64.length > MAX_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/=]+$/.test(imageBase64)
  ) {
    return response({ error: 'invalid_image' }, 400);
  }

  const [approvedResult, discoveryResult] = await Promise.all([
    admin
      .from('brand_source_domains')
      .select('domain, brand, source_kind, license, license_url'),
    admin
      .from('product_discovery_domains')
      .select('domain, source_kind')
      .eq('enabled', true),
  ]);
  if (approvedResult.error || discoveryResult.error) {
    return response({ error: 'lookup_failed' }, 500);
  }
  const approvedRows = approvedResult.data;
  const approvedDomains = (approvedRows ?? []) as ApprovedDomain[];
  const discoveryDomains = (discoveryResult.data ?? []) as DiscoveryDomain[];
  const recognizedOcrBrand = approvedDomains.find(
    ({ brand, source_kind }) =>
      source_kind === 'manufacturer' &&
      normalizeWebText(recognizedText).includes(normalizeWebText(brand)),
  );

  if (recognizedOcrBrand) {
    const manufacturerPage = await discoverManufacturerPage(
      approvedDomains,
      recognizedOcrBrand.brand,
      recognizedText,
    );
    if (manufacturerPage) {
      const manufacturerMatch = await persistEnrichedWebCandidate(
        admin,
        manufacturerCandidate(manufacturerPage),
      );
      if (manufacturerMatch) {
        return response({
          matches: [manufacturerMatch],
          meta: {
            googleCandidateCount: 0,
            normalizedGoogleCandidateCount: 0,
            serpApiCandidateCount: 0,
            normalizedSerpApiCandidateCount: 0,
            serpApiStatus: 'not_needed',
            catalogueCandidateCount: 0,
          },
        });
      }
    }
  }

  const apiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  if (!apiKey) return response({ error: 'visual_lookup_unavailable' }, 503);
  const googleRequestId = `${requestId}:google`;
  const budget = await consumeGoogleVisionBudget(
    admin,
    user.id,
    googleRequestId,
  );
  if (!budget.allowed) {
    const quotaReached = [
      'global_quota_reached',
      'quota_reached',
      'rate_limited',
    ].includes(budget.reason);
    return response({ error: budget.reason }, quotaReached ? 429 : 503);
  }

  const googleStartedAt = Date.now();
  let detection: WebDetection = {};
  let googleProviderError: 'provider_failed' | 'provider_unavailable' | null =
    null;
  try {
    const googleResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(
        apiKey,
      )}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBase64 },
              features: [{ type: 'WEB_DETECTION', maxResults: 10 }],
            },
          ],
        }),
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!googleResponse.ok) {
      await recordProviderUsageOutcome(
        admin,
        'google_vision',
        user.id,
        googleRequestId,
        `http_${googleResponse.status}`,
        googleStartedAt,
      );
      googleProviderError = 'provider_unavailable';
    } else {
      const googlePayload = await googleResponse.json();
      const annotation = googlePayload?.responses?.[0];
      if (annotation?.error) {
        await recordProviderUsageOutcome(
          admin,
          'google_vision',
          user.id,
          googleRequestId,
          'provider_error',
          googleStartedAt,
        );
        googleProviderError = 'provider_failed';
      } else {
        await recordProviderUsageOutcome(
          admin,
          'google_vision',
          user.id,
          googleRequestId,
          'success',
          googleStartedAt,
        );
        detection = (annotation?.webDetection ?? {}) as WebDetection;
      }
    }
  } catch {
    await recordProviderUsageOutcome(
      admin,
      'google_vision',
      user.id,
      googleRequestId,
      'network_error',
      googleStartedAt,
    );
    googleProviderError = 'provider_unavailable';
  }

  const detectionSignals =
    `${recognizedText} ${webDetectionSignals(detection)}`.trim();
  const googleWebCandidates = candidatesFromWebDetection(
    detection,
    approvedDomains,
  );
  const recognizedBrand = approvedDomains.find(
    ({ brand, source_kind }) =>
      source_kind === 'manufacturer' &&
      normalizeWebText(detectionSignals).includes(normalizeWebText(brand)),
  );
  const retailerHints = recognizedBrand
    ? retailerIdentityHintsFromWebDetection(
        detection,
        discoveryDomains,
        recognizedBrand.brand,
      )
    : [];
  const sitemapPage =
    !googleWebCandidates.length && recognizedBrand
      ? await discoverManufacturerPage(
          approvedDomains,
          recognizedBrand.brand,
          `${detectionSignals} ${retailerHints.join(' ')}`,
        )
      : null;
  const googleCandidates = [
    ...googleWebCandidates,
    ...(sitemapPage ? [manufacturerCandidate(sitemapPage)] : []),
  ].filter(
    (candidate) =>
      !recognizedOcrBrand ||
      (normalizeWebText(candidate.brand) ===
        normalizeWebText(recognizedOcrBrand.brand) &&
        visualProductIdentityOverlap(
          recognizedText,
          candidate.name,
          candidate.brand,
        ) > 0),
  );
  const normalizedGoogleCandidates = (
    await Promise.all(
      googleCandidates.map((candidate) =>
        persistEnrichedWebCandidate(admin, candidate),
      ),
    )
  ).filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== null,
  );
  const serpApiKey = Deno.env.get('SERPAPI_API_KEY');
  let serpApiStatus:
    'not_configured' | 'not_needed' | 'success' | 'no_match' | 'unavailable' =
    serpApiKey ? 'not_needed' : 'not_configured';
  let serpApiCandidates: ReturnType<typeof candidatesFromWebDetection> = [];
  let serpApiRetailerHints: string[] = [];
  let serpApiError: SerpApiSearchError['code'] | null = null;
  if (!normalizedGoogleCandidates.length && recognizedText.trim()) {
    if (serpApiKey) {
      try {
        const primaryRequestId = `${requestId}:serpapi:primary`;
        const primaryBudget = await consumeSerpApiBudget(
          admin,
          user.id,
          primaryRequestId,
        );
        if (!primaryBudget.allowed) {
          throw new SerpApiSearchError(
            primaryBudget.reason === 'quota_reached' ||
              primaryBudget.reason === 'global_quota_reached'
              ? 'quota'
              : 'provider',
          );
        }
        const primaryStartedAt = Date.now();
        try {
          const serpApiResult = await searchSerpApiProductImages(
            serpApiKey,
            recognizedText,
            approvedDomains,
            discoveryDomains,
            (recognizedOcrBrand ?? recognizedBrand)?.brand ?? '',
          );
          serpApiCandidates = serpApiResult.candidates;
          serpApiRetailerHints = serpApiResult.retailerHints;
          if (
            !serpApiCandidates.length &&
            serpApiRetailerHints.length &&
            (recognizedOcrBrand ?? recognizedBrand)
          ) {
            const hintedBrand = (recognizedOcrBrand ?? recognizedBrand)!;
            const hintedPage = await discoverManufacturerPage(
              approvedDomains,
              hintedBrand.brand,
              `${recognizedText} ${serpApiRetailerHints.join(' ')}`,
            );
            if (hintedPage) {
              serpApiCandidates = [manufacturerCandidate(hintedPage)];
            }
          }
          await recordProviderUsageOutcome(
            admin,
            'serpapi',
            user.id,
            primaryRequestId,
            'success',
            primaryStartedAt,
          );
        } catch (error) {
          await recordProviderUsageOutcome(
            admin,
            'serpapi',
            user.id,
            primaryRequestId,
            error instanceof SerpApiSearchError ? error.code : 'provider_error',
            primaryStartedAt,
          );
          throw error;
        }
        serpApiStatus = serpApiCandidates.length ? 'success' : 'no_match';
      } catch (error) {
        serpApiStatus = 'unavailable';
        serpApiError =
          error instanceof SerpApiSearchError ? error.code : 'provider';
      }
    }
  }
  const normalizedSerpApiCandidates = (
    await Promise.all(
      serpApiCandidates.map((candidate) =>
        persistEnrichedWebCandidate(admin, candidate),
      ),
    )
  ).filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== null,
  );
  const normalizedWebCandidates = [
    ...normalizedGoogleCandidates,
    ...normalizedSerpApiCandidates,
  ];
  const signals = detectionSignals;
  const terms = textTokens(signals)
    .map(compactText)
    .filter(Boolean)
    .slice(0, 8);

  let catalogueMatches: Record<string, unknown>[] = [];
  if (terms.length) {
    const filters = terms.flatMap((term) => [
      `normalized_name.ilike.%${term}%`,
      `normalized_brand.ilike.%${term}%`,
    ]);
    const { data } = await admin
      .from('products')
      .select(
        'id, canonical_name, brand, category, image_url, product_aliases(alias), product_formulas(ingredients_text, source_provider, source_url, language, confidence, status)',
      )
      .or(filters.join(','))
      .limit(30);
    const rankedProducts = (data ?? [])
      .map((product) => ({ product, score: scoreProduct(signals, product) }))
      .filter(({ score }) => score >= 0.35)
      .sort((left, right) => right.score - left.score)
      .slice(0, 3);
    catalogueMatches = (
      await Promise.all(
        rankedProducts.map(async ({ product, score }) => {
          const image = await ensureNormalizedProductImage(admin, product);
          if (!image) return null;
          const formula = (product.product_formulas ?? [])
            .filter(({ status }: { status: string }) => status === 'approved')
            .sort(
              (left: { confidence: number }, right: { confidence: number }) =>
                right.confidence - left.confidence,
            )[0];
          return {
            id: product.id,
            name: product.canonical_name,
            brand: product.brand,
            category: controlledProductCategory(
              product.category,
              product.canonical_name,
            ),
            imageUrl: image.imageUrl,
            imageSource: image.imageSource,
            imageSourceUrl: image.imageSourceUrl,
            imageLicense: image.imageLicense,
            imageLicenseUrl: image.imageLicenseUrl,
            sourceUrl: null,
            score,
            ingredientsText: formula?.ingredients_text ?? null,
            ingredientsSource: formula?.source_provider ?? null,
            ingredientsSourceUrl: formula?.source_url ?? null,
            matchSource: 'catalogue',
          };
        }),
      )
    ).filter(Boolean) as Record<string, unknown>[];
  }

  const seen = new Set<string>();
  const matches = [...catalogueMatches, ...normalizedWebCandidates]
    .sort((left, right) => Number(right.score) - Number(left.score))
    .filter((candidate) => {
      const key = normalizeWebText(
        `${candidate.brand ?? ''} ${candidate.name}`,
      );
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);

  if (serpApiStatus === 'unavailable' && !normalizedGoogleCandidates.length) {
    return response({ error: 'provider_unavailable' }, 503);
  }
  if (
    googleProviderError &&
    serpApiStatus === 'not_configured' &&
    !normalizedGoogleCandidates.length
  ) {
    return response({ error: googleProviderError }, 503);
  }

  return response({
    matches,
    meta: {
      googleCandidateCount: googleCandidates.length,
      normalizedGoogleCandidateCount: normalizedGoogleCandidates.length,
      serpApiCandidateCount: serpApiCandidates.length,
      normalizedSerpApiCandidateCount: normalizedSerpApiCandidates.length,
      serpApiStatus,
      catalogueCandidateCount: catalogueMatches.length,
      retailerHintCount: retailerHints.length + serpApiRetailerHints.length,
      ...(diagnosticsEnabled
        ? {
            providerDiagnostics: {
              bestGuessLabels: (detection.bestGuessLabels ?? [])
                .map(({ label }) => label)
                .filter(Boolean)
                .slice(0, 5),
              webEntities: (detection.webEntities ?? [])
                .map(({ description }) => description)
                .filter(Boolean)
                .slice(0, 10),
              serpApiError,
              pages: (detection.pagesWithMatchingImages ?? [])
                .slice(0, 10)
                .map((page) => ({
                  domain: safeHostname(page.url),
                  title: page.pageTitle?.slice(0, 200) ?? null,
                  fullImageDomains: (page.fullMatchingImages ?? [])
                    .map(({ url }) => safeHostname(url))
                    .filter(Boolean)
                    .slice(0, 5),
                  partialImageDomains: (page.partialMatchingImages ?? [])
                    .map(({ url }) => safeHostname(url))
                    .filter(Boolean)
                    .slice(0, 5),
                })),
            },
          }
        : {}),
    },
  });
});
