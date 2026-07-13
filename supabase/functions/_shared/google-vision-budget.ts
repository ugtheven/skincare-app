import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type GoogleVisionBudgetResult =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'disabled'
        | 'quota_not_configured'
        | 'quota_check_failed'
        | 'quota_reached';
    };

export async function consumeGoogleVisionBudget(
  admin: SupabaseClient<any>,
  userId: string,
): Promise<GoogleVisionBudgetResult> {
  if ((Deno.env.get('GOOGLE_VISUAL_LOOKUP_ENABLED') ?? 'false') !== 'true') {
    return { allowed: false, reason: 'disabled' };
  }

  const configuredLimit = Number.parseInt(
    Deno.env.get('VISUAL_LOOKUP_DAILY_USER_LIMIT') ?? '0',
    10,
  );
  const dailyLimit = Number.isFinite(configuredLimit)
    ? Math.max(0, configuredLimit)
    : 0;
  const allowUnmeteredDevelopment =
    (Deno.env.get('ALLOW_UNMETERED_VISUAL_LOOKUP') ?? 'false') === 'true';
  if (dailyLimit === 0) {
    return allowUnmeteredDevelopment
      ? { allowed: true }
      : { allowed: false, reason: 'quota_not_configured' };
  }

  const { data: withinQuota, error } = await admin.rpc(
    'consume_visual_lookup_quota',
    { target_user_id: userId, daily_limit: dailyLimit },
  );
  if (error) return { allowed: false, reason: 'quota_check_failed' };
  return withinQuota
    ? { allowed: true }
    : { allowed: false, reason: 'quota_reached' };
}
