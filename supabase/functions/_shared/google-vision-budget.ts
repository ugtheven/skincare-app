import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type GoogleVisionBudgetResult =
  | { allowed: true; requestId: string }
  | {
      allowed: false;
      reason:
        | 'disabled'
        | 'duplicate_request'
        | 'global_quota_reached'
        | 'invalid_request'
        | 'quota_not_configured'
        | 'quota_check_failed'
        | 'quota_reached'
        | 'rate_limited';
    };

type Provider = 'google_vision' | 'serpapi';

function positiveLimit(name: string, fallback = 0) {
  const configured = Number.parseInt(Deno.env.get(name) ?? `${fallback}`, 10);
  return Number.isFinite(configured) ? Math.max(0, configured) : 0;
}

function developmentOverrideEnabled() {
  return (
    Deno.env.get('VISUAL_LOOKUP_RUNTIME_ENV') === 'development' &&
    Deno.env.get('ALLOW_UNMETERED_VISUAL_LOOKUP') === 'true'
  );
}

async function consumeProviderBudget(
  admin: SupabaseClient<any>,
  provider: Provider,
  userId: string,
  requestId: string,
  enabled: boolean,
  userLimitName: string,
  globalLimitName: string,
): Promise<GoogleVisionBudgetResult> {
  if (!enabled) return { allowed: false, reason: 'disabled' };

  const unmeteredDevelopment = developmentOverrideEnabled();
  const dailyUserLimit = unmeteredDevelopment
    ? 1_000_000_000
    : positiveLimit(userLimitName);
  const dailyGlobalLimit = unmeteredDevelopment
    ? 1_000_000_000
    : positiveLimit(globalLimitName);
  const minuteUserLimit = unmeteredDevelopment
    ? 1_000_000
    : positiveLimit('VISUAL_LOOKUP_MINUTE_USER_LIMIT', 3);
  if (!dailyUserLimit || !dailyGlobalLimit || !minuteUserLimit) {
    return { allowed: false, reason: 'quota_not_configured' };
  }

  const { data, error } = await admin.rpc('consume_provider_quota', {
    target_provider: provider,
    target_user_id: userId,
    target_request_id: requestId,
    daily_user_limit: dailyUserLimit,
    daily_global_limit: dailyGlobalLimit,
    minute_user_limit: minuteUserLimit,
  });
  if (error) return { allowed: false, reason: 'quota_check_failed' };
  const supported = [
    'duplicate_request',
    'global_quota_reached',
    'invalid_request',
    'quota_not_configured',
    'quota_reached',
    'rate_limited',
  ] as const;
  if (data !== 'allowed') {
    const reason =
      typeof data === 'string' &&
      supported.some((supportedReason) => supportedReason === data)
        ? (data as (typeof supported)[number])
        : 'quota_check_failed';
    return {
      allowed: false,
      reason,
    };
  }
  return { allowed: true, requestId };
}

export async function consumeGoogleVisionBudget(
  admin: SupabaseClient<any>,
  userId: string,
  requestId: string,
): Promise<GoogleVisionBudgetResult> {
  return consumeProviderBudget(
    admin,
    'google_vision',
    userId,
    requestId,
    Deno.env.get('GOOGLE_VISUAL_LOOKUP_ENABLED') === 'true',
    'VISUAL_LOOKUP_DAILY_USER_LIMIT',
    'VISUAL_LOOKUP_GLOBAL_DAILY_LIMIT',
  );
}

export async function consumeSerpApiBudget(
  admin: SupabaseClient<any>,
  userId: string,
  requestId: string,
) {
  return consumeProviderBudget(
    admin,
    'serpapi',
    userId,
    requestId,
    Deno.env.get('SERPAPI_VISUAL_LOOKUP_ENABLED') === 'true',
    'SERPAPI_DAILY_USER_LIMIT',
    'SERPAPI_GLOBAL_DAILY_LIMIT',
  );
}

export async function recordProviderUsageOutcome(
  admin: SupabaseClient<any>,
  provider: Provider,
  userId: string,
  requestId: string,
  outcome: string,
  startedAt: number,
) {
  try {
    await admin.rpc('record_provider_usage_outcome', {
      target_provider: provider,
      target_user_id: userId,
      target_request_id: requestId,
      target_outcome: outcome,
      target_latency_ms: Date.now() - startedAt,
    });
  } catch {
    // Telemetry must never change the user-facing lookup result.
  }
}
