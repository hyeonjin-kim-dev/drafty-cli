import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { DraftyError } from './errors.js';

export async function openEditor(initialContent = ''): Promise<string> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'drafty-'));
    const draftPath = path.join(tempDir, 'note.md');

    try {
        await writeFile(draftPath, initialContent, 'utf8');

        const editor = resolveEditorCommand();
        const result = spawnSync(editor.command, [...editor.args, draftPath], {
            stdio: 'inherit',
        });

        if (result.error) {
            if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new DraftyError(
                    `Editor '${editor.command}' was not found. Set VISUAL or EDITOR and try again.`,
                );
            }

            throw new DraftyError(
                `Failed to open the editor. ${(result.error as Error).message}`,
            );
        }

        if ((result.status ?? 0) !== 0) {
            throw new DraftyError(
                `The editor exited with status ${result.status ?? 1}.`,
            );
        }

        return await readFile(draftPath, 'utf8');
    } finally {
        await rm(tempDir, { recursive: true, force: true });
    }
}

function resolveEditorCommand(): { command: string; args: string[] } {
    const configuredEditor =
        process.env.VISUAL?.trim() || process.env.EDITOR?.trim();
    const fallbackEditor = resolveFallbackEditor();
    const tokens = splitCommand(configuredEditor || fallbackEditor);

    if (tokens.length === 0) {
        throw new DraftyError('No editor command could be resolved.');
    }

    const command = tokens[0];

    if (!command) {
        throw new DraftyError('No editor command could be resolved.');
    }

    const args = tokens.slice(1);
    return { command, args };
}

function resolveFallbackEditor(): string {
    if (process.platform !== 'win32') {
        return 'vim';
    }

    const windowsRoot =
        process.env.SYSTEMROOT?.trim() || process.env.WINDIR?.trim();

    if (!windowsRoot) {
        return 'notepad.exe';
    }

    return path.join(windowsRoot, 'System32', 'notepad.exe');
}

function splitCommand(value: string): string[] {
    const tokens: string[] = [];
    let currentToken = '';
    let activeQuote: "'" | '"' | null = null;
    let escaping = false;

    for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        const nextCharacter = value[index + 1];

        if (!character) {
            continue;
        }

        if (escaping) {
            currentToken += character;
            escaping = false;
            continue;
        }

        if (character === '\\' && activeQuote !== "'") {
            const shouldEscape =
                typeof nextCharacter === 'string' &&
                (nextCharacter === '\\' ||
                    nextCharacter === '"' ||
                    nextCharacter === "'" ||
                    /\s/u.test(nextCharacter));

            if (shouldEscape) {
                escaping = true;
                continue;
            }

            currentToken += character;
            continue;
        }

        if (character === "'" || character === '"') {
            if (!activeQuote) {
                activeQuote = character;
                continue;
            }

            if (activeQuote === character) {
                activeQuote = null;
                continue;
            }
        }

        if (/\s/u.test(character) && !activeQuote) {
            if (currentToken) {
                tokens.push(currentToken);
                currentToken = '';
            }

            continue;
        }

        currentToken += character;
    }

    if (activeQuote) {
        throw new DraftyError('EDITOR or VISUAL contains an unmatched quote.');
    }

    if (escaping) {
        currentToken += '\\';
    }

    if (currentToken) {
        tokens.push(currentToken);
    }

    return tokens;
}
