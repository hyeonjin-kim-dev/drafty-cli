import {
    deleteLegacySessionFile,
    deleteSavedSupabaseConfig,
} from '../lib/config.js';

export async function logoutCommand(): Promise<void> {
    const [removedConfig, removedSession] = await Promise.all([
        deleteSavedSupabaseConfig(),
        deleteLegacySessionFile(),
    ]);

    if (!removedConfig && !removedSession) {
        console.log('No local Drafty config was found.');
        return;
    }

    if (removedConfig && removedSession) {
        console.log('Removed the saved Drafty config and legacy session file.');
        return;
    }

    if (removedConfig) {
        console.log('Removed the saved Drafty config.');
        return;
    }

    console.log('Removed the legacy session file.');
}
