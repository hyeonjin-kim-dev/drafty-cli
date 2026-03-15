import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { requireSupabaseEnv, type SupabaseEnv } from './config.js';
import { wrapSupabaseError } from './errors.js';
import type { Database } from '../types/database.types.js';

export function createBaseClient(): SupabaseClient<Database> {
    const env = requireSupabaseEnv();
    return createConfiguredClient(env.supabaseUrl, env.supabaseAnonKey);
}

export function createNotesClient(): SupabaseClient<Database> {
    return createBaseClient();
}

export async function verifySupabaseConfigAccess(
    env: Required<Pick<SupabaseEnv, 'supabaseUrl' | 'supabaseAnonKey'>>,
): Promise<void> {
    const supabase = createConfiguredClient(
        env.supabaseUrl,
        env.supabaseAnonKey,
    );
    const { error } = await supabase
        .from('notes')
        .select('id', { head: true, count: 'exact' })
        .limit(1);

    if (error) {
        throw wrapSupabaseError('Failed to verify the Supabase project', error);
    }
}

function createConfiguredClient(
    supabaseUrl: string,
    supabaseAnonKey: string,
): SupabaseClient<Database> {
    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}
