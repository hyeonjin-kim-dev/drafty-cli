import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { requireSupabaseEnv } from './config.js';
import type { Database } from '../types/database.types.js';

export function createBaseClient(): SupabaseClient<Database> {
    const env = requireSupabaseEnv();
    return createConfiguredClient(env.supabaseUrl, env.supabaseAnonKey);
}

export function createAuthedClient(
    accessToken: string,
): SupabaseClient<Database> {
    const env = requireSupabaseEnv();

    return createConfiguredClient(env.supabaseUrl, env.supabaseAnonKey, {
        Authorization: `Bearer ${accessToken}`,
    });
}

function createConfiguredClient(
    supabaseUrl: string,
    supabaseAnonKey: string,
    headers?: Record<string, string>,
): SupabaseClient<Database> {
    return createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
        global: {
            headers,
        },
    });
}
