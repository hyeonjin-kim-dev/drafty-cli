export class DraftyError extends Error {
    constructor(
        message: string,
        public readonly code = 'DRAFTY_ERROR',
    ) {
        super(message);
        this.name = 'DraftyError';
    }
}

interface SupabaseErrorLike {
    code?: string;
    message?: string;
    status?: number;
}

export function wrapSupabaseError(
    context: string,
    error: SupabaseErrorLike | null | undefined,
): DraftyError {
    if (!error) {
        return new DraftyError(context);
    }

    const message =
        error.message?.trim() || 'Supabase returned an unknown error.';
    const normalizedMessage = message.toLowerCase();

    if (
        normalizedMessage.includes('fetch failed') ||
        normalizedMessage.includes('network')
    ) {
        return new DraftyError(
            `${context}. Network access to Supabase failed.`,
        );
    }

    if (
        normalizedMessage.includes('invalid otp') ||
        normalizedMessage.includes('token has expired')
    ) {
        return new DraftyError(
            'The email code is invalid or expired. Run `drafty login` again.',
        );
    }

    if (normalizedMessage.includes('email rate limit')) {
        return new DraftyError(
            'Too many sign-in code requests. Wait a moment and try again.',
        );
    }

    if (error.status === 401) {
        return new DraftyError(
            'Authentication failed. Run `drafty login` again.',
        );
    }

    return new DraftyError(`${context}. ${message}`);
}

export function formatError(error: unknown): string {
    if (error instanceof DraftyError) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return 'Unexpected error.';
}
