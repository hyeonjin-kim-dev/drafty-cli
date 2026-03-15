import { createInterface } from 'node:readline/promises';

import confirm from '@inquirer/confirm';

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

export async function promptForConfirmation(
    message: string,
    defaultValue = false,
): Promise<boolean> {
    if (process.stdin.isTTY && process.stdout.isTTY) {
        return confirm({
            message,
            default: defaultValue,
        });
    }

    const suffix = defaultValue ? ' [Y/n] ' : ' [y/N] ';
    const answer = (await prompt(`${message}${suffix}`)).toLowerCase();

    if (!answer) {
        return defaultValue;
    }

    return answer === 'y' || answer === 'yes';
}
