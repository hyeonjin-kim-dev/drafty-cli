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
        normalizedMessage.includes('invalid api key') ||
        normalizedMessage.includes('invalid jwt') ||
        normalizedMessage.includes('jwt malformed') ||
        error.status === 401
    ) {
        return new DraftyError(
            'Supabase rejected these credentials. Check your saved URL and anon key, then run `drafty login` again.',
        );
    }

    if (normalizedMessage.includes('email rate limit')) {
        return new DraftyError(
            'Supabase temporarily rejected repeated requests. Wait a moment and try again.',
        );
    }

    if (
        normalizedMessage.includes('could not find the table') ||
        normalizedMessage.includes('relation "public.notes" does not exist') ||
        normalizedMessage.includes('permission denied for table notes') ||
        normalizedMessage.includes(
            'row-level security policy for table "notes"',
        ) ||
        normalizedMessage.includes('null value in column "user_id"') ||
        normalizedMessage.includes('column "user_id"') ||
        normalizedMessage.includes('column "source_kind"') ||
        normalizedMessage.includes('column "is_readonly"') ||
        normalizedMessage.includes('column "source_env_label"') ||
        normalizedMessage.includes('column "source_repo_root"') ||
        normalizedMessage.includes('column "source_worktree_path"') ||
        normalizedMessage.includes('column "source_relative_path"') ||
        normalizedMessage.includes('column "source_hash"') ||
        normalizedMessage.includes('column "synced_at"')
    ) {
        return new DraftyError(
            'Your Supabase project is missing the latest Drafty schema. Apply the repository migrations, then run `drafty login` again.',
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
