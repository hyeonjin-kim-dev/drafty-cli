import { createInterface } from 'node:readline/promises';

export async function prompt(message: string): Promise<string> {
    const readline = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    try {
        return (await readline.question(message)).trim();
    } finally {
        readline.close();
    }
}
