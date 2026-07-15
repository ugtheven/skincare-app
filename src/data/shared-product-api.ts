import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type {
  ProductDraft,
  ProductInformationConfidence,
} from '@/domain/product';
import {
  normalizeProductCategory,
  textLookupQuery,
  type ProductCandidate,
} from '@/domain/product-recognition';

type SharedProduct = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  imageUrl: string | null;
  imageSource?: string | null;
  imageSourceUrl?: string | null;
  imageLicense?: string | null;
  imageLicenseUrl?: string | null;
  score?: number;
  ingredientsText?: string | null;
  ingredientsSource?: string | null;
  ingredientsSourceUrl?: string | null;
  usageText?: string | null;
  usageSource?: string | null;
  usageSourceUrl?: string | null;
  precautionsText?: string | null;
  precautionsSource?: string | null;
  precautionsSourceUrl?: string | null;
  informationConfidence?: ProductInformationConfidence | null;
  confidenceSource?: string | null;
  confidenceSourceUrl?: string | null;
  confidenceNote?: string | null;
};

type LookupResponse = { matches: SharedProduct[] };

type VisualLookupResponse = {
  matches: (SharedProduct & {
    matchSource?: 'catalogue' | 'google';
    sourceUrl?: string | null;
    ingredientsText?: string | null;
    ingredientsSource?: string | null;
    ingredientsSourceUrl?: string | null;
  })[];
  meta?: {
    googleCandidateCount?: number;
    normalizedGoogleCandidateCount?: number;
    serpApiCandidateCount?: number;
    normalizedSerpApiCandidateCount?: number;
    serpApiStatus?:
      'not_configured' | 'not_needed' | 'success' | 'no_match' | 'unavailable';
    catalogueCandidateCount?: number;
  };
};

const FUNCTION_TIMEOUT_MS = 12_000;

async function withFunctionTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs = FUNCTION_TIMEOUT_MS,
  externalSignal?: AbortSignal,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const abort = () => controller.abort();
  if (externalSignal?.aborted) controller.abort();
  externalSignal?.addEventListener('abort', abort, { once: true });
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener('abort', abort);
  }
}

export type VisualLookupResult = {
  candidates: ProductCandidate[];
  googleCandidateCount: number;
  normalizedGoogleCandidateCount: number;
  serpApiCandidateCount: number;
  normalizedSerpApiCandidateCount: number;
  serpApiStatus:
    'not_configured' | 'not_needed' | 'success' | 'no_match' | 'unavailable';
  catalogueCandidateCount: number;
};

export type VisualLookupErrorCode =
  | 'authentication_required'
  | 'invalid_image'
  | 'duplicate_request'
  | 'global_quota_reached'
  | 'network_unavailable'
  | 'rate_limited'
  | 'relay_unavailable'
  | 'request_timeout'
  | 'quota_reached'
  | 'disabled'
  | 'quota_not_configured'
  | 'quota_check_failed'
  | 'provider_unavailable'
  | 'provider_failed'
  | 'visual_lookup_unavailable'
  | 'unknown';

export class VisualLookupError extends Error {
  constructor(public readonly code: VisualLookupErrorCode) {
    super(code);
    this.name = 'VisualLookupError';
  }
}

async function visualLookupErrorCode(error: unknown) {
  const response = (error as { context?: unknown })?.context;
  if (!(response instanceof Response)) {
    const signature = [
      (error as { name?: string })?.name,
      (error as { message?: string })?.message,
      (response as { name?: string })?.name,
      (response as { message?: string })?.message,
    ]
      .filter(Boolean)
      .join(' ');
    if (/abort|timeout/i.test(signature)) return 'request_timeout' as const;
    if (/FunctionsRelayError/i.test(signature)) {
      return 'relay_unavailable' as const;
    }
    if (
      /FunctionsFetchError|fetch|network request failed|network error|failed to load/i.test(
        signature,
      )
    ) {
      return 'network_unavailable' as const;
    }
    return 'unknown' as const;
  }
  const payload = await response
    .clone()
    .json()
    .catch(() => null);
  const code = payload?.error;
  const supported: VisualLookupErrorCode[] = [
    'authentication_required',
    'invalid_image',
    'duplicate_request',
    'global_quota_reached',
    'quota_reached',
    'rate_limited',
    'disabled',
    'quota_not_configured',
    'quota_check_failed',
    'provider_unavailable',
    'provider_failed',
    'visual_lookup_unavailable',
  ];
  return supported.includes(code) ? code : ('unknown' as const);
}

let client: SupabaseClient | null | undefined;

function getClient() {
  if (client !== undefined) return client;

  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  client =
    url && publishableKey
      ? createClient(url, publishableKey, {
          auth: {
            autoRefreshToken: true,
            detectSessionInUrl: false,
            persistSession: true,
          },
        })
      : null;

  return client;
}

async function ensureAnonymousSession(supabase: SupabaseClient) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session) {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (user && !error) return;
    await supabase.auth.signOut({ scope: 'local' });
  }

  const { error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
}

export async function lookupSharedProductByIdentifier(
  identifier: string,
  options: { refreshOnly?: boolean } = {},
): Promise<ProductDraft | null | undefined> {
  const supabase = getClient();
  if (!supabase) return undefined;

  await ensureAnonymousSession(supabase);
  const { data, error } = await withFunctionTimeout((signal) =>
    supabase.functions.invoke<LookupResponse>('product-lookup', {
      body: {
        mode: options.refreshOnly ? 'identifier_refresh' : 'identifier',
        value: identifier,
      },
      signal,
    }),
  );

  if (error) throw error;
  const product = data?.matches[0];
  if (!product) return null;

  return {
    name: product.name,
    brand: product.brand ?? '',
    category:
      normalizeProductCategory(
        product.category,
        [product.brand, product.name].join(' '),
      ) || 'Autre',
    barcode: identifier,
    imageUrl: product.imageUrl ?? '',
    imageSource: product.imageSource ?? '',
    imageSourceUrl: product.imageSourceUrl ?? '',
    imageLicense: product.imageLicense ?? '',
    imageLicenseUrl: product.imageLicenseUrl ?? '',
    ingredientsText: product.ingredientsText ?? '',
    ingredientsSource: product.ingredientsSource ?? '',
    ingredientsSourceUrl: product.ingredientsSourceUrl ?? '',
    usageText: product.usageText ?? '',
    usageSource: product.usageSource ?? '',
    usageSourceUrl: product.usageSourceUrl ?? '',
    precautionsText: product.precautionsText ?? '',
    precautionsSource: product.precautionsSource ?? '',
    precautionsSourceUrl: product.precautionsSourceUrl ?? '',
    informationConfidence: product.informationConfidence ?? '',
    confidenceSource: product.confidenceSource ?? '',
    confidenceSourceUrl: product.confidenceSourceUrl ?? '',
    confidenceNote: product.confidenceNote ?? '',
    source: 'barcode',
  };
}

export async function refreshSharedProductByIdentifier(identifier: string) {
  return lookupSharedProductByIdentifier(identifier, { refreshOnly: true });
}

export async function lookupSharedProductsByText(
  recognizedText: string,
): Promise<ProductCandidate[] | undefined> {
  const body = textLookupRequestBody(recognizedText);
  const query = body.value;
  if (!query) return [];

  const supabase = getClient();
  if (!supabase) return undefined;

  await ensureAnonymousSession(supabase);
  const { data, error } = await withFunctionTimeout((signal) =>
    supabase.functions.invoke<LookupResponse>('product-lookup', {
      body,
      signal,
    }),
  );
  if (error) throw error;

  return (data?.matches ?? []).map((product) => ({
    id: product.id,
    name: product.name,
    brand: product.brand,
    category:
      normalizeProductCategory(
        product.category,
        [product.brand, product.name].join(' '),
      ) || 'Autre',
    imageUrl: product.imageUrl,
    imageSource: product.imageSource ?? null,
    imageSourceUrl: product.imageSourceUrl ?? null,
    imageLicense: product.imageLicense ?? null,
    imageLicenseUrl: product.imageLicenseUrl ?? null,
    ingredientsText: product.ingredientsText ?? null,
    ingredientsSource: product.ingredientsSource ?? null,
    ingredientsSourceUrl: product.ingredientsSourceUrl ?? null,
    usageText: product.usageText ?? null,
    usageSource: product.usageSource ?? null,
    usageSourceUrl: product.usageSourceUrl ?? null,
    precautionsText: product.precautionsText ?? null,
    precautionsSource: product.precautionsSource ?? null,
    precautionsSourceUrl: product.precautionsSourceUrl ?? null,
    informationConfidence: product.informationConfidence ?? null,
    confidenceSource: product.confidenceSource ?? null,
    confidenceSourceUrl: product.confidenceSourceUrl ?? null,
    confidenceNote: product.confidenceNote ?? null,
    score: product.score ?? 0,
    source: 'shared',
  }));
}

export async function lookupProductsByVisualFallback(
  input: {
    imageBase64: string;
    mimeType: 'image/jpeg';
    recognizedText: string;
    requestId: string;
    identifier?: string;
  },
  signal?: AbortSignal,
): Promise<VisualLookupResult> {
  const supabase = getClient();
  if (!supabase) throw new Error('visual_lookup_unavailable');

  try {
    await ensureAnonymousSession(supabase);
  } catch {
    throw new VisualLookupError('authentication_required');
  }
  let result: Awaited<
    ReturnType<typeof supabase.functions.invoke<VisualLookupResponse>>
  >;
  try {
    result = await withFunctionTimeout(
      (signal) =>
        supabase.functions.invoke<VisualLookupResponse>(
          'product-visual-lookup',
          { body: input, signal },
        ),
      40_000,
      signal,
    );
  } catch (error) {
    throw new VisualLookupError(await visualLookupErrorCode(error));
  }
  const { data, error } = result;
  if (error) throw new VisualLookupError(await visualLookupErrorCode(error));

  const candidates: ProductCandidate[] = (data?.matches ?? []).map(
    (product) => ({
      id: product.id,
      name: product.name,
      brand: product.brand,
      category:
        normalizeProductCategory(
          product.category,
          [product.brand, product.name].join(' '),
        ) || 'Autre',
      imageUrl: product.imageUrl,
      imageSource: product.imageSource ?? null,
      imageSourceUrl: product.imageSourceUrl ?? product.sourceUrl ?? null,
      imageLicense: product.imageLicense ?? null,
      imageLicenseUrl: product.imageLicenseUrl ?? null,
      ingredientsText: product.ingredientsText ?? null,
      ingredientsSource: product.ingredientsSource ?? null,
      ingredientsSourceUrl: product.ingredientsSourceUrl ?? null,
      usageText: product.usageText ?? null,
      usageSource: product.usageSource ?? null,
      usageSourceUrl: product.usageSourceUrl ?? null,
      precautionsText: product.precautionsText ?? null,
      precautionsSource: product.precautionsSource ?? null,
      precautionsSourceUrl: product.precautionsSourceUrl ?? null,
      informationConfidence: product.informationConfidence ?? null,
      confidenceSource: product.confidenceSource ?? null,
      confidenceSourceUrl: product.confidenceSourceUrl ?? null,
      confidenceNote: product.confidenceNote ?? null,
      score: product.score ?? 0,
      source: product.matchSource === 'catalogue' ? 'shared' : 'google-web',
    }),
  );
  return {
    candidates,
    googleCandidateCount: data?.meta?.googleCandidateCount ?? 0,
    normalizedGoogleCandidateCount:
      data?.meta?.normalizedGoogleCandidateCount ?? 0,
    serpApiCandidateCount: data?.meta?.serpApiCandidateCount ?? 0,
    normalizedSerpApiCandidateCount:
      data?.meta?.normalizedSerpApiCandidateCount ?? 0,
    serpApiStatus: data?.meta?.serpApiStatus ?? 'not_configured',
    catalogueCandidateCount: data?.meta?.catalogueCandidateCount ?? 0,
  };
}

export function textLookupRequestBody(recognizedText: string) {
  return { mode: 'text' as const, value: textLookupQuery(recognizedText) };
}

export function wrongGuessSubmissionBody(
  candidate: Pick<ProductCandidate, 'id' | 'name' | 'brand' | 'category'>,
  recognizedText: string,
) {
  return {
    reason: 'wrong_guess' as const,
    proposedProductId: candidate.id,
    identifierValue: textLookupQuery(recognizedText),
    name: candidate.name,
    brand: candidate.brand,
    category: candidate.category,
  };
}

export async function submitWrongProductGuess(
  candidate: ProductCandidate,
  recognizedText: string,
): Promise<void> {
  if (candidate.source !== 'shared') return;

  const supabase = getClient();
  if (!supabase) throw new Error('shared_catalogue_unavailable');

  await ensureAnonymousSession(supabase);
  const { error } = await withFunctionTimeout((signal) =>
    supabase.functions.invoke('product-submission', {
      body: wrongGuessSubmissionBody(candidate, recognizedText),
      signal,
    }),
  );
  if (error) throw error;
}

export async function submitConfirmedWebProduct(
  candidate: ProductCandidate,
  recognizedText: string,
  identifierValue?: string,
): Promise<void> {
  if (candidate.source !== 'google-web') return;
  const supabase = getClient();
  if (!supabase) return;

  await ensureAnonymousSession(supabase);
  const { error } = await withFunctionTimeout((signal) =>
    supabase.functions.invoke('product-submission', {
      body: {
        reason: 'new_product',
        identifierValue: identifierValue ?? textLookupQuery(recognizedText),
        name: candidate.name,
        brand: candidate.brand,
        category: candidate.category,
        imageUrl: candidate.imageUrl,
        imageSourceUrl: candidate.imageSourceUrl,
        ingredientsText: candidate.ingredientsText,
        ingredientsSource: candidate.ingredientsSource,
        ingredientsSourceUrl: candidate.ingredientsSourceUrl,
      },
      signal,
    }),
  );
  if (error) throw error;
}
