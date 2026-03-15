import { requireAuthenticatedSession } from '../lib/auth.js';

export async function whoamiCommand(): Promise<void> {
    const session = await requireAuthenticatedSession();

    console.log(session.email || session.userId);

    if (session.email) {
        console.log(`User ID: ${session.userId}`);
    }
}
