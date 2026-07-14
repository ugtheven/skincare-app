import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const bucket = 'product-packshots';
const openFactsLicense = 'CC BY-SA';
const openFactsLicenseUrl =
  'https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/';

export type ImageSource = {
  domain: string;
  sourceKind: 'manufacturer' | 'licensed_catalogue';
  sourceUrl: string;
  sourcePageUrl: string | null;
  sourceName: string;
  license: string | null;
  licenseUrl: string | null;
};

export type NormalizedProductImage = {
  imageId: string;
  imageUrl: string;
  imageSource: string;
  imageSourceUrl: string | null;
  imageLicense: string | null;
  imageLicenseUrl: string | null;
};

function normalizeText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function openFactsSource(value: string, barcode: string): ImageSource | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase('en-US');
    if (
      host !== 'images.openbeautyfacts.org' &&
      host !== 'images.openfoodfacts.org'
    ) {
      return null;
    }
    const beauty = host === 'images.openbeautyfacts.org';
    return {
      domain: host,
      sourceKind: 'licensed_catalogue',
      sourceUrl: url.toString(),
      sourcePageUrl: `https://world.${
        beauty ? 'openbeautyfacts' : 'openfoodfacts'
      }.org/product/${encodeURIComponent(barcode)}`,
      sourceName: beauty ? 'Open Beauty Facts' : 'Open Food Facts',
      license: openFactsLicense,
      licenseUrl: openFactsLicenseUrl,
    };
  } catch {
    return null;
  }
}

async function signature(body: string, timestamp: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function invokeNormalizer(imageId: string) {
  const url = Deno.env.get('PRODUCT_IMAGE_NORMALIZER_URL');
  const secret = Deno.env.get('NORMALIZER_JOB_SECRET');
  if (!url || !secret) return null;
  const body = JSON.stringify({ imageId });
  const timestamp = Date.now().toString();
  const response = await fetch(`${url.replace(/\/$/, '')}/normalize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Job-Signature': await signature(body, timestamp, secret),
      'X-Job-Timestamp': timestamp,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const payload = await response.json().catch(() => null);
  return typeof payload?.imageUrl === 'string' ? payload.imageUrl : null;
}

function publicImageUrl(admin: SupabaseClient, storagePath: string) {
  return admin.storage.from(bucket).getPublicUrl(storagePath).data.publicUrl;
}

async function waitForNormalizedStoragePath(
  admin: SupabaseClient,
  imageId: string,
) {
  for (const delay of [150, 300, 600, 1_000]) {
    await new Promise((resolve) => setTimeout(resolve, delay));
    const { data } = await admin
      .from('product_images')
      .select('storage_path, status')
      .eq('id', imageId)
      .maybeSingle();
    if (data?.storage_path) return data.storage_path as string;
    if (data?.status === 'rejected') return null;
  }
  return null;
}

export async function normalizeSourceImage(
  admin: SupabaseClient,
  source: ImageSource,
  productId: string | null,
): Promise<NormalizedProductImage | null> {
  const { data: existing } = await admin
    .from('product_images')
    .select('id, product_id, storage_path, status')
    .eq('source_url', source.sourceUrl)
    .maybeSingle();

  let image = existing;
  if (!image) {
    const { data, error } = await admin
      .from('product_images')
      .insert({
        product_id: productId,
        source_url: source.sourceUrl,
        source_page_url: source.sourcePageUrl,
        source_domain: source.domain,
        source_kind: source.sourceKind,
        license: source.license,
        license_url: source.licenseUrl,
        status: 'pending',
      })
      .select('id, product_id, storage_path, status')
      .single();
    if (error || !data) return null;
    image = data;
  } else if (productId && !image.product_id) {
    await admin
      .from('product_images')
      .update({ product_id: productId })
      .eq('id', image.id);
  }

  if (image.status === 'rejected') return null;
  let imageUrl = image.storage_path
    ? publicImageUrl(admin, image.storage_path)
    : null;
  if (!imageUrl) imageUrl = await invokeNormalizer(image.id);
  if (
    !imageUrl &&
    Deno.env.get('PRODUCT_IMAGE_NORMALIZER_URL') &&
    Deno.env.get('NORMALIZER_JOB_SECRET')
  ) {
    const storagePath = await waitForNormalizedStoragePath(admin, image.id);
    if (storagePath) imageUrl = publicImageUrl(admin, storagePath);
  }
  if (!imageUrl) return null;

  if (productId) {
    await admin
      .from('products')
      .update({ image_url: imageUrl, updated_at: new Date().toISOString() })
      .eq('id', productId);
  }

  return {
    imageId: image.id,
    imageUrl,
    imageSource: source.sourceName,
    imageSourceUrl: source.sourcePageUrl,
    imageLicense: source.license,
    imageLicenseUrl: source.licenseUrl,
  };
}

async function approvedImageForProduct(
  admin: SupabaseClient,
  productId: string,
): Promise<NormalizedProductImage | null> {
  const { data } = await admin
    .from('product_images')
    .select(
      'id, storage_path, source_page_url, source_domain, source_kind, license, license_url, brand_source_domains(brand)',
    )
    .eq('product_id', productId)
    .eq('status', 'approved')
    .order('verified_at', { ascending: false })
    .limit(10);
  const preferred = (data ?? []).sort((left, right) => {
    if (left.source_kind === right.source_kind) return 0;
    return left.source_kind === 'manufacturer' ? -1 : 1;
  })[0];
  if (!preferred?.storage_path) return null;
  const sourceName =
    preferred.source_kind === 'licensed_catalogue'
      ? preferred.source_domain.includes('beauty')
        ? 'Open Beauty Facts'
        : 'Open Food Facts'
      : (preferred.brand_source_domains as { brand?: string } | null)?.brand ||
        'Fabricant';
  return {
    imageId: preferred.id,
    imageUrl: publicImageUrl(admin, preferred.storage_path),
    imageSource: sourceName,
    imageSourceUrl: preferred.source_page_url,
    imageLicense: preferred.license,
    imageLicenseUrl: preferred.license_url,
  };
}

export async function ensureNormalizedProductImage(
  admin: SupabaseClient,
  product: { id: string; image_url: string | null },
  knownBarcode?: string,
  knownSourceUrl?: string | null,
  normalizeIfMissing = true,
): Promise<NormalizedProductImage | null> {
  const approved = await approvedImageForProduct(admin, product.id);
  if (approved) return approved;
  if (!normalizeIfMissing) return null;

  let barcode = knownBarcode;
  if (!barcode) {
    const { data } = await admin
      .from('product_identifiers')
      .select('normalized_value')
      .eq('product_id', product.id)
      .eq('kind', 'barcode')
      .limit(1)
      .maybeSingle();
    barcode = data?.normalized_value;
  }
  if (!barcode) return null;

  let sourceUrl = knownSourceUrl || product.image_url;
  if (!sourceUrl || !openFactsSource(sourceUrl, barcode)) {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v3/product/${encodeURIComponent(
        barcode,
      )}.json?product_type=all&fields=image_front_url,image_url`,
      {
        headers: {
          'User-Agent':
            Deno.env.get('OPEN_BEAUTY_FACTS_USER_AGENT') ?? 'SkincareApp/1.0',
        },
        signal: AbortSignal.timeout(8_000),
      },
    ).catch(() => null);
    if (!response?.ok) return null;
    const payload = await response.json().catch(() => null);
    sourceUrl =
      payload?.product?.image_front_url || payload?.product?.image_url || null;
  }

  const source = sourceUrl ? openFactsSource(sourceUrl, barcode) : null;
  return source ? normalizeSourceImage(admin, source, product.id) : null;
}

export async function recordProductDiscovery(
  admin: SupabaseClient,
  candidate: {
    id: string;
    name: string;
    brand: string;
    category: string | null;
    sourceUrl: string;
  },
  image: NormalizedProductImage | null,
) {
  const fingerprint = candidate.id;
  const { data: existing } = await admin
    .from('product_discoveries')
    .select('id, sightings_count')
    .eq('fingerprint', fingerprint)
    .maybeSingle();
  const values = {
    proposed_name: candidate.name,
    normalized_name: normalizeText(candidate.name).replace(/\s+/g, ''),
    proposed_brand: candidate.brand,
    normalized_brand: normalizeText(candidate.brand).replace(/\s+/g, ''),
    proposed_category: candidate.category,
    source_provider: candidate.id.startsWith('serpapi-images:')
      ? 'serpapi_google_images'
      : 'google_web_detection',
    source_page_url: candidate.sourceUrl,
    product_image_id: image?.imageId ?? null,
    normalized_image_url: image?.imageUrl ?? null,
    last_seen_at: new Date().toISOString(),
  };
  if (existing) {
    await admin
      .from('product_discoveries')
      .update({ ...values, sightings_count: existing.sightings_count + 1 })
      .eq('id', existing.id);
  } else {
    await admin.from('product_discoveries').insert({
      fingerprint,
      ...values,
    });
  }
}
