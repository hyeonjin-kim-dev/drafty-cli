import {
    getSupabaseEnv,
    readSavedSupabaseEnv,
    writeSavedSupabaseConfig,
} from '../lib/config.js';
import { prompt, promptForConfirmation } from '../lib/prompt.js';
import { verifySupabaseConfigAccess } from '../lib/supabase.js';

export async function loginCommand(): Promise<void> {
    const savedConfig = await readSavedSupabaseEnv();

    if (savedConfig) {
        const shouldOverwrite = await promptForConfirmation(
            'Overwrite the saved Drafty config?',
            false,
        );

        if (!shouldOverwrite) {
            console.log('Canceled.');
            return;
        }
    }

    const defaults = {
        ...getSupabaseEnv(),
        ...savedConfig,
    };

    const supabaseUrl = await promptForSetting(
        'SUPABASE_URL',
        defaults.supabaseUrl,
        validateSupabaseUrl,
    );
    const supabaseAnonKey = await promptForSetting(
        'SUPABASE_ANON_KEY',
        defaults.supabaseAnonKey,
        validateSupabaseAnonKey,
        false,
    );
    const supabaseProjectId = await promptForSetting(
        'SUPABASE_PROJECT_ID',
        defaults.supabaseProjectId,
        validateSupabaseProjectId,
    );

    console.log('Checking Supabase connectivity...');
    await verifySupabaseConfigAccess({
        supabaseUrl,
        supabaseAnonKey,
    });

    await writeSavedSupabaseConfig({
        supabaseUrl,
        supabaseAnonKey,
        supabaseProjectId,
    });

    console.log('Saved Drafty config.');
    console.log('You can now run `drafty list` or `drafty work idea`.');
}

async function promptForSetting(
    name: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_PROJECT_ID',
    defaultValue: string | undefined,
    validate: (value: string) => string | null,
    showDefaultValue = true,
): Promise<string> {
    while (true) {
        const value = await prompt(
            buildPromptMessage(name, defaultValue, showDefaultValue),
        );
        const nextValue = value || defaultValue || '';
        const errorMessage = validate(nextValue);

        if (!errorMessage) {
            return nextValue;
        }

        console.log(errorMessage);
    }
}

function buildPromptMessage(
    name: string,
    defaultValue: string | undefined,
    showDefaultValue: boolean,
): string {
    if (!defaultValue) {
        return `${name}: `;
    }

    if (!showDefaultValue) {
        return `${name} [press Enter to keep the current value]: `;
    }

    return `${name} [${defaultValue}]: `;
}

function validateSupabaseUrl(value: string): string | null {
    if (!value.trim()) {
        return 'SUPABASE_URL is required.';
    }

    try {
        const parsed = new URL(value);

        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return 'SUPABASE_URL must start with http:// or https://.';
        }

        if (!parsed.hostname) {
            return 'SUPABASE_URL must include a hostname.';
        }

        return null;
    } catch {
        return 'Enter a valid SUPABASE_URL.';
    }
}

function validateSupabaseAnonKey(value: string): string | null {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return 'SUPABASE_ANON_KEY is required.';
    }

    if (/\s/u.test(trimmedValue)) {
        return 'SUPABASE_ANON_KEY must not contain whitespace.';
    }

    if (trimmedValue.length < 16) {
        return 'Enter a valid SUPABASE_ANON_KEY.';
    }

    return null;
}

function validateSupabaseProjectId(value: string): string | null {
    const trimmedValue = value.trim();

    if (!trimmedValue) {
        return 'SUPABASE_PROJECT_ID is required.';
    }

    if (!/^[a-z0-9-]+$/u.test(trimmedValue)) {
        return 'SUPABASE_PROJECT_ID must contain only lowercase letters, numbers, or hyphens.';
    }

    return null;
}
