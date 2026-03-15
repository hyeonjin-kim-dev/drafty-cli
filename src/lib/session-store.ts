import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Session } from '@supabase/supabase-js';

import { getDraftyPaths } from './config.js';
import { DraftyError } from './errors.js';

export interface StoredSession {
    accessToken: string;
    refreshToken: string;
    userId: string;
    email: string;
    expiresAt: number;
}

export async function readSession(): Promise<StoredSession | null> {
    const { sessionFilePath } = getDraftyPaths();

    try {
        const raw = await readFile(sessionFilePath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<StoredSession>;

        if (
            typeof parsed.accessToken !== 'string' ||
            typeof parsed.refreshToken !== 'string' ||
            typeof parsed.userId !== 'string' ||
            typeof parsed.email !== 'string' ||
            typeof parsed.expiresAt !== 'number'
        ) {
            throw new DraftyError(
                'The local session file is corrupted. Run `drafty logout` and log in again.',
            );
        }

        return parsed as StoredSession;
    } catch (error) {
        const maybeNodeError = error as NodeJS.ErrnoException;

        if (maybeNodeError.code === 'ENOENT') {
            return null;
        }

        if (error instanceof SyntaxError) {
            throw new DraftyError(
                'The local session file is corrupted. Run `drafty logout` and log in again.',
            );
        }

        throw error;
    }
}

export async function writeSession(session: StoredSession): Promise<void> {
    const { configDir, sessionFilePath } = getDraftyPaths();
    const tempPath = path.join(configDir, `session.${process.pid}.tmp`);

    await mkdir(configDir, { recursive: true });
    await writeFile(tempPath, JSON.stringify(session, null, 2), 'utf8');
    await rename(tempPath, sessionFilePath);
}

export async function deleteSession(): Promise<void> {
    const { sessionFilePath } = getDraftyPaths();
    await rm(sessionFilePath, { force: true });
}

export function fromSupabaseSession(
    session: Session,
    fallbackEmail = '',
): StoredSession {
    const expiresAt = session.expires_at;
    const userId = session.user.id;
    const email = session.user.email ?? fallbackEmail;

    if (
        !session.access_token ||
        !session.refresh_token ||
        !userId ||
        !email ||
        !expiresAt
    ) {
        throw new DraftyError('Supabase returned an incomplete session.');
    }

    return {
        accessToken: session.access_token,
        refreshToken: session.refresh_token,
        userId,
        email,
        expiresAt,
    };
}

export function isSessionExpiringSoon(session: StoredSession): boolean {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    return session.expiresAt <= nowInSeconds + 60;
}
