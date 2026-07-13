import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return Response.json(
      { error: 'authentication_required' },
      { status: 401, headers: corsHeaders },
    );
  }

  const {
    reason,
    proposedProductId,
    identifierValue,
    name,
    brand,
    category,
    imageUrl,
    imageSourceUrl,
    ingredientsText,
    ingredientsSource,
    ingredientsSourceUrl,
  } = await request.json().catch(() => ({}));
  if (
    !['new_product', 'wrong_guess', 'correction'].includes(reason) ||
    ![identifierValue, name, proposedProductId].some(
      (value) => typeof value === 'string' && value.trim(),
    )
  ) {
    return Response.json(
      { error: 'invalid_request' },
      { status: 400, headers: corsHeaders },
    );
  }

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey =
    Deno.env.get('SUPABASE_ANON_KEY') ??
    Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ??
    '';
  const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const caller = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
  });
  const {
    data: { user },
  } = await caller.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  if (!user) {
    return Response.json(
      { error: 'authentication_required' },
      { status: 401, headers: corsHeaders },
    );
  }

  const admin = createClient(url, adminKey);
  const { error } = await admin.from('product_submissions').insert({
    submitted_by: user.id,
    proposed_product_id: proposedProductId || null,
    identifier_value: identifierValue?.trim() || null,
    proposed_name: name?.trim() || null,
    proposed_brand: brand?.trim() || null,
    proposed_category: category?.trim() || null,
    proposed_image_url: imageUrl?.trim().slice(0, 2000) || null,
    proposed_image_source_url: imageSourceUrl?.trim().slice(0, 2000) || null,
    proposed_ingredients_text: ingredientsText?.trim().slice(0, 20000) || null,
    proposed_ingredients_source:
      ingredientsSource?.trim().slice(0, 200) || null,
    proposed_ingredients_source_url:
      ingredientsSourceUrl?.trim().slice(0, 2000) || null,
    reason,
  });
  if (error) {
    return Response.json(
      { error: 'submission_failed' },
      { status: 500, headers: corsHeaders },
    );
  }

  return Response.json({ status: 'pending' }, { headers: corsHeaders });
});
