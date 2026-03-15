import { createAuthedClient, createBaseClient } from './supabase.js';
import { DraftyError, wrapSupabaseError } from './errors.js';
import {
    deleteSession,
    fromSupabaseSession,
    isSessionExpiringSoon,
    readSession,
    type StoredSession,
    writeSession,
} from './session-store.js';

export async function requestOtp(email: string): Promise<void> {
    const supabase = createBaseClient();
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
        throw wrapSupabaseError('Failed to send the sign-in code', error);
    }
}

export async function verifyOtpCode(
    email: string,
    token: string,
): Promise<StoredSession> {
    const supabase = createBaseClient();
    const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
    });

    if (error || !data.session || !data.user) {
        throw wrapSupabaseError('Failed to verify the sign-in code', error);
    }

    const storedSession = fromSupabaseSession(
        data.session,
        data.user.email ?? email,
    );
    await writeSession(storedSession);
    return storedSession;
}

export async function requireAuthenticatedSession(): Promise<StoredSession> {
    const session = await readSession();

    if (!session) {
        throw new DraftyError('Login required. Run `drafty login` first.');
    }

    if (!isSessionExpiringSoon(session)) {
        return session;
    }

    try {
        return await refreshStoredSession(session);
    } catch (error) {
        if (
            error instanceof DraftyError &&
            error.code === 'SUPABASE_ENV_MISSING'
        ) {
            throw error;
        }

        await deleteSession();
        throw new DraftyError('Session expired. Run `drafty login` again.');
    }
}

export async function logoutLocalSession(): Promise<boolean> {
    const existingSession = await readSession();
    await deleteSession();
    return existingSession !== null;
}

export function createNotesClient(session: StoredSession) {
    return createAuthedClient(session.accessToken);
}

async function refreshStoredSession(
    session: StoredSession,
): Promise<StoredSession> {
    const supabase = createBaseClient();
    const { data, error } = await supabase.auth.refreshSession({
        refresh_token: session.refreshToken,
    });

    if (error || !data.session) {
        throw wrapSupabaseError('Failed to refresh the session', error);
    }

    const refreshedSession = fromSupabaseSession(
        data.session,
        data.user?.email ?? session.email,
    );
    await writeSession(refreshedSession);
    return refreshedSession;
}
