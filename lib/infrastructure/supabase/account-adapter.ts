import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { validateProfile, validatePasswordChange, type AccountProfile } from '@/lib/application/portal/account';

export function createAccountAdapter(client: SupabaseClient, url: string, key: string) {
  async function user() {
    const { data, error } = await client.auth.getUser();
    if (error || !data.user) throw new Error('session');
    return data.user;
  }
  async function verifyPassword(password: string) {
    const current = await user();
    const transient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'account-reauth' } });
    const result = await transient.auth.signInWithPassword({ email: current.email!, password });
    if (result.error) throw new Error('current');
    await transient.auth.signOut({ scope: 'local' });
  }
  return {
    async load() {
      const current = await user();
      const { data, error } = await client.from('profiles').select('display_name,nationality,phone').eq('id', current.id).single();
      if (error) throw new Error('failed');
      return { displayName: data.display_name ?? '', nationality: data.nationality ?? '', phone: data.phone ?? '', email: current.email ?? '', pendingEmail: current.new_email ?? '' };
    },
    async save(profile: AccountProfile) {
      const invalid = validateProfile(profile);
      if (invalid) throw new Error(invalid);
      const current = await user();
      const { data, error } = await client.from('profiles').update({ display_name: profile.displayName.trim(), nationality: profile.nationality || null, phone: profile.phone.replace(/[\s()-]/g, '') || null }).eq('id', current.id).select('id').single();
      if (error || !data) throw new Error('failed');
    },
    async changePassword(current: string, password: string, confirmation: string) {
      const invalid = validatePasswordChange(current, password, confirmation);
      if (invalid) throw new Error(invalid);
      await verifyPassword(current);
      const { error } = await client.auth.updateUser({ password });
      if (error) throw new Error(error.code === 'same_password' ? 'same' : 'failed');
      const signout = await client.auth.signOut({ scope: 'global' });
      if (signout.error) throw new Error('signout');
    },
  };
}
export type AccountAdapter = ReturnType<typeof createAccountAdapter>;
