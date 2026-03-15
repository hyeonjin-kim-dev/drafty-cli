import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { config as loadDotenv, parse as parseDotenv } from 'dotenv';

import { DraftyError } from './errors.js';

export interface DraftyPaths {
    configDir: string;
    configFilePath: string;
    sessionFilePath: string;
}

export interface SupabaseEnv {
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    supabaseProjectId?: string;
}

export interface SavedSupabaseConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
    supabaseProjectId: string;
}

let hasLoadedDraftyEnv = false;

export function loadDraftyEnv(): void {
    if (hasLoadedDraftyEnv) {
        return;
    }

    loadDotenv({ quiet: true });

    const { configDir } = getDraftyPaths();

    loadDotenv({
        path: path.join(configDir, '.env'),
        override: false,
        quiet: true,
    });

    hasLoadedDraftyEnv = true;
}

export function getDraftyPaths(): DraftyPaths {
    const configRoot = getConfigRootDirectory();
    const appDirectoryName = process.platform === 'win32' ? 'Drafty' : 'drafty';
    const configDir = path.join(configRoot, appDirectoryName);

    return {
        configDir,
        configFilePath: path.join(configDir, '.env'),
        sessionFilePath: path.join(configDir, 'session.json'),
    };
}

export function getSupabaseEnv(): SupabaseEnv {
    loadDraftyEnv();

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
            'Drafty is not configured. Run `drafty login` to save your Supabase project, or set SUPABASE_URL and SUPABASE_ANON_KEY in your environment.',
            'SUPABASE_ENV_MISSING',
        );
    }

    return env as Required<
        Pick<SupabaseEnv, 'supabaseUrl' | 'supabaseAnonKey'>
    > &
        Pick<SupabaseEnv, 'supabaseProjectId'>;
}

export async function readSavedSupabaseEnv(): Promise<SupabaseEnv | null> {
    const { configFilePath } = getDraftyPaths();

    try {
        const raw = await readFile(configFilePath, 'utf8');
        const parsed = parseDotenv(raw);

        return {
            supabaseUrl: parsed.SUPABASE_URL?.trim(),
            supabaseAnonKey: parsed.SUPABASE_ANON_KEY?.trim(),
            supabaseProjectId: parsed.SUPABASE_PROJECT_ID?.trim(),
        };
    } catch (error) {
        const maybeNodeError = error as NodeJS.ErrnoException;

        if (maybeNodeError.code === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

export async function writeSavedSupabaseConfig(
    config: SavedSupabaseConfig,
): Promise<void> {
    const { configDir, configFilePath } = getDraftyPaths();
    const tempPath = path.join(configDir, `.env.${process.pid}.tmp`);

    await mkdir(configDir, { recursive: true });
    await writeFile(tempPath, serializeSavedSupabaseConfig(config), 'utf8');
    await rename(tempPath, configFilePath);
}

export async function deleteSavedSupabaseConfig(): Promise<boolean> {
    const { configFilePath } = getDraftyPaths();

    try {
        await rm(configFilePath);
        return true;
    } catch (error) {
        const maybeNodeError = error as NodeJS.ErrnoException;

        if (maybeNodeError.code === 'ENOENT') {
            return false;
        }

        throw error;
    }
}

export async function deleteLegacySessionFile(): Promise<boolean> {
    const { sessionFilePath } = getDraftyPaths();

    try {
        await rm(sessionFilePath);
        return true;
    } catch (error) {
        const maybeNodeError = error as NodeJS.ErrnoException;

        if (maybeNodeError.code === 'ENOENT') {
            return false;
        }

        throw error;
    }
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

function serializeSavedSupabaseConfig(config: SavedSupabaseConfig): string {
    return [
        `SUPABASE_URL=${JSON.stringify(config.supabaseUrl)}`,
        `SUPABASE_ANON_KEY=${JSON.stringify(config.supabaseAnonKey)}`,
        `SUPABASE_PROJECT_ID=${JSON.stringify(config.supabaseProjectId)}`,
        '',
    ].join('\n');
}
