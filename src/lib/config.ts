import os from 'node:os';
import path from 'node:path';

import { DraftyError } from './errors.js';

export interface DraftyPaths {
    configDir: string;
    sessionFilePath: string;
}

export interface SupabaseEnv {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    supabaseProjectId?: string;
}

export function getDraftyPaths(): DraftyPaths {
    const configRoot = getConfigRootDirectory();
    const appDirectoryName = process.platform === 'win32' ? 'Drafty' : 'drafty';
    const configDir = path.join(configRoot, appDirectoryName);

    return {
        configDir,
        sessionFilePath: path.join(configDir, 'session.json'),
    };
}

export function getSupabaseEnv(): SupabaseEnv {
    return {
        supabaseUrl: process.env.SUPABASE_URL?.trim(),
        supabaseAnonKey: process.env.SUPABASE_ANON_KEY?.trim(),
        supabaseProjectId: process.env.SUPABASE_PROJECT_ID?.trim(),
    };
}

export function requireSupabaseEnv(): Required<
    Pick<SupabaseEnv, 'supabaseUrl' | 'supabaseAnonKey'>
> &
    Pick<SupabaseEnv, 'supabaseProjectId'> {
    const env = getSupabaseEnv();

    if (!env.supabaseUrl || !env.supabaseAnonKey) {
        throw new DraftyError(
            'SUPABASE_URL and SUPABASE_ANON_KEY must be set before using Drafty.',
            'SUPABASE_ENV_MISSING',
        );
    }

    return env as Required<
        Pick<SupabaseEnv, 'supabaseUrl' | 'supabaseAnonKey'>
    > &
        Pick<SupabaseEnv, 'supabaseProjectId'>;
}

function getConfigRootDirectory(): string {
    if (process.platform === 'win32') {
        return (
            process.env.APPDATA?.trim() ||
            path.join(os.homedir(), 'AppData', 'Roaming')
        );
    }

    return (
        process.env.XDG_CONFIG_HOME?.trim() ||
        path.join(os.homedir(), '.config')
    );
}
