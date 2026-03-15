import { logoutLocalSession } from '../lib/auth.js';

export async function logoutCommand(): Promise<void> {
    const hadSession = await logoutLocalSession();

    if (!hadSession) {
        console.log('No local session was found.');
        return;
    }

    console.log('Logged out.');
}
