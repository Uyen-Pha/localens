import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeGuidePhone, validateGuideField, type GuidePersonalProfile, type GuideProfilePort } from '@/lib/application/portal/guide-profile';

function parse(value: unknown): GuidePersonalProfile {
  if (!value || typeof value !== 'object') throw new Error('failed');
  const row = value as Record<string, unknown>;
  const keys = ['displayName', 'email', 'phone', 'contactAddress', 'bio', 'language', 'operatingArea', 'joinedAt'] as const;
  if (keys.some(key => typeof row[key] !== 'string')) throw new Error('failed');
  return Object.fromEntries(keys.map(key => [key, row[key]])) as unknown as GuidePersonalProfile;
}
export function createGuideProfileAdapter(client: SupabaseClient): GuideProfilePort {
  return {
    async load() {
      const { data, error } = await client.rpc('get_own_guide_profile');
      if (error) throw new Error('failed');
      return parse(data);
    },
    async save(field, value) {
      if (validateGuideField(field, value)) throw new Error(field);
      const { data, error } = await client.rpc('update_own_guide_profile', {
        p_field: field, p_value: field === 'phone' ? normalizeGuidePhone(value) : value.trim(),
      });
      if (error) throw new Error(error.code === '23505' ? 'duplicate' : 'failed');
      return parse(data);
    },
  };
}
