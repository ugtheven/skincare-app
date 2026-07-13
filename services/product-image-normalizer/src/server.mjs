import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { createServer } from 'node:http';
import { isIP } from 'node:net';

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

import { normalizeProductPackshot } from './image.mjs';

const port = Number.parseInt(process.env.PORT ?? '8080', 10);
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const jobSecret = process.env.NORMALIZER_JOB_SECRET ?? '';
const bucket = 'product-packshots';
const maxSourceBytes = 5 * 1024 * 1024;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function signatureIsValid(body, timestamp, signature) {
  if (!jobSecret || !timestamp || !signature) return false;
  const issuedAt = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > 60_000) {
    return false;
  }
  const expected = createHmac('sha256', jobSecret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function isPrivateAddress(address) {
  if (!isIP(address)) return true;
  if (
    address === '::1' ||
    address.startsWith('fc') ||
    address.startsWith('fd')
  ) {
    return true;
  }
  if (address.startsWith('fe80:')) return true;
  const parts = address.split('.').map(Number);
  if (parts.length !== 4) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

async function assertPublicHttpsUrl(value, approvedDomain) {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('invalid_source_url');
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  const domain = approvedDomain.toLowerCase();
  if (host !== domain && !host.endsWith(`.${domain}`)) {
    throw new Error('unapproved_source_domain');
  }
  const addresses = await lookup(url.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateAddress(address))
  ) {
    throw new Error('unsafe_source_address');
  }
  return url;
}

async function downloadImage(url) {
  const response = await fetch(url, {
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error('source_unavailable');
  const type = response.headers.get('content-type')?.split(';')[0] ?? '';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
    throw new Error('unsupported_source_type');
  }
  const declaredSize = Number(response.headers.get('content-length') ?? '0');
  if (declaredSize > maxSourceBytes) throw new Error('source_too_large');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxSourceBytes) throw new Error('source_too_large');
  return bytes;
}

async function normalizeImage(imageId) {
  const { data: image, error } = await supabase
    .from('product_images')
    .select('id, product_id, source_url, source_domain, status')
    .eq('id', imageId)
    .eq('status', 'pending')
    .maybeSingle();
  if (error || !image) throw new Error('image_not_pending');

  const sourceUrl = await assertPublicHttpsUrl(
    image.source_url,
    image.source_domain,
  );
  const source = await downloadImage(sourceUrl);
  const pipeline = sharp(source, {
    failOn: 'warning',
    limitInputPixels: 50_000_000,
  });
  const metadata = await pipeline.metadata();
  if (!metadata.width || !metadata.height)
    throw new Error('invalid_dimensions');

  const normalized = await normalizeProductPackshot(source);
  const sha256 = createHash('sha256').update(normalized).digest('hex');
  const storagePath = `${image.product_id ?? 'pending'}/${image.id}-${sha256.slice(0, 12)}.webp`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(storagePath, normalized, {
      cacheControl: '31536000',
      contentType: 'image/webp',
      upsert: false,
    });
  if (uploadError) throw new Error('storage_upload_failed');
  const { data: publicUrl } = supabase.storage
    .from(bucket)
    .getPublicUrl(storagePath);
  const { error: updateError } = await supabase
    .from('product_images')
    .update({
      storage_path: storagePath,
      sha256,
      width: 1024,
      height: 1024,
      status: 'approved',
      verified_at: new Date().toISOString(),
    })
    .eq('id', image.id)
    .eq('status', 'pending');
  if (updateError) throw new Error('image_update_failed');
  if (image.product_id) {
    await supabase
      .from('products')
      .update({
        image_url: publicUrl.publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', image.product_id);
  }
  return { imageUrl: publicUrl.publicUrl, sha256 };
}

createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    return json(response, 200, { status: 'ok' });
  }
  if (request.method !== 'POST' || request.url !== '/normalize') {
    return json(response, 404, { error: 'not_found' });
  }

  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000)
      return json(response, 413, { error: 'request_too_large' });
  }
  if (
    !signatureIsValid(
      body,
      request.headers['x-job-timestamp'],
      request.headers['x-job-signature'],
    )
  ) {
    return json(response, 401, { error: 'invalid_signature' });
  }

  const { imageId } = JSON.parse(body || '{}');
  if (typeof imageId !== 'string')
    return json(response, 400, { error: 'invalid_request' });
  try {
    return json(response, 200, await normalizeImage(imageId));
  } catch (error) {
    return json(response, 422, {
      error: error instanceof Error ? error.message : 'normalization_failed',
    });
  }
}).listen(port);
