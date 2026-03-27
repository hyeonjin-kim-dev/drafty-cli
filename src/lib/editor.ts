import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import { DraftyError } from './errors.js';

interface ResolvedEditorCommand {
    command: string;
    args: string[];
}

export interface EditorSession {
    completion: Promise<string>;
}

export async function openEditor(initialContent = ''): Promise<string> {
    const { tempDir, draftPath } = await createEditorDraft(initialContent);

    try {
        const editor = resolveEditorCommand();
        const result = spawnSync(editor.command, [...editor.args, draftPath], {
            stdio: 'inherit',
        });

        if (result.error) {
            if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
                throw new DraftyError(
                    buildEditorNotFoundMessage(editor.command),
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
        await removeEditorDraft(tempDir);
    }
}

export async function openEditorSession(
    initialContent = '',
): Promise<EditorSession> {
    const { tempDir, draftPath } = await createEditorDraft(initialContent);
    const editor = resolveEditorCommand();

    if (!supportsBackgroundEditorSessions(editor)) {
        await removeEditorDraft(tempDir);
        throw new DraftyError(
            buildUnsupportedBackgroundEditorMessage(editor.command),
        );
    }

    const child = spawn(editor.command, [...editor.args, draftPath], {
        stdio: 'inherit',
    });

    let cleanedUp = false;
    const cleanupDraft = async (): Promise<void> => {
        if (cleanedUp) {
            return;
        }

        cleanedUp = true;
        await removeEditorDraft(tempDir);
    };

    return {
        completion: new Promise<string>((resolve, reject) => {
            child.once('error', async (error) => {
                await cleanupDraft();

                if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                    reject(
                        new DraftyError(
                            buildEditorNotFoundMessage(editor.command),
                        ),
                    );
                    return;
                }

                reject(
                    new DraftyError(
                        `Failed to open the editor. ${(error as Error).message}`,
                    ),
                );
            });

            child.once('close', async (status) => {
                try {
                    if ((status ?? 0) !== 0) {
                        reject(
                            new DraftyError(
                                `The editor exited with status ${status ?? 1}.`,
                            ),
                        );
                        return;
                    }

                    resolve(await readFile(draftPath, 'utf8'));
                } catch (error) {
                    reject(error);
                } finally {
                    await cleanupDraft();
                }
            });
        }),
    };
}

export function canOpenEditorInBackground(): boolean {
    try {
        return supportsBackgroundEditorSessions(resolveEditorCommand());
    } catch {
        return false;
    }
}

function resolveEditorCommand(): ResolvedEditorCommand {
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

    return resolveWindowsEditorCommand({ command, args });
}

function resolveWindowsEditorCommand(editor: {
    command: string;
    args: string[];
}): ResolvedEditorCommand {
    if (process.platform !== 'win32') {
        return editor;
    }

    const vscodeExecutable = resolveWindowsVsCodeExecutable(editor.command);

    if (vscodeExecutable) {
        return {
            command: vscodeExecutable,
            args: editor.args,
        };
    }

    return editor;
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

function resolveWindowsVsCodeExecutable(command: string): string | null {
    const basename = path.win32.basename(command).toLowerCase();

    if (!isVsCodeCommandName(basename)) {
        return null;
    }

    const localAppData = process.env.LOCALAPPDATA?.trim();
    const programFiles = process.env.PROGRAMFILES?.trim();
    const programFilesX86 = process.env['PROGRAMFILES(X86)']?.trim();
    const candidates = basename.includes('insiders')
        ? [
              localAppData &&
                  path.join(
                      localAppData,
                      'Programs',
                      'Microsoft VS Code Insiders',
                      'Code - Insiders.exe',
                  ),
              programFiles &&
                  path.join(
                      programFiles,
                      'Microsoft VS Code Insiders',
                      'Code - Insiders.exe',
                  ),
              programFilesX86 &&
                  path.join(
                      programFilesX86,
                      'Microsoft VS Code Insiders',
                      'Code - Insiders.exe',
                  ),
          ]
        : [
              localAppData &&
                  path.join(
                      localAppData,
                      'Programs',
                      'Microsoft VS Code',
                      'Code.exe',
                  ),
              programFiles &&
                  path.join(programFiles, 'Microsoft VS Code', 'Code.exe'),
              programFilesX86 &&
                  path.join(programFilesX86, 'Microsoft VS Code', 'Code.exe'),
          ];

    for (const candidate of candidates) {
        if (candidate && existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
}

function isVsCodeCommandName(commandName: string): boolean {
    return (
        commandName === 'code' ||
        commandName === 'code.cmd' ||
        commandName === 'code.exe' ||
        commandName === 'code-insiders' ||
        commandName === 'code-insiders.cmd' ||
        commandName === 'code - insiders.exe'
    );
}

function supportsBackgroundEditorSessions(
    editor: ResolvedEditorCommand,
): boolean {
    if (process.platform !== 'win32') {
        return false;
    }

    const commandName = path.win32.basename(editor.command).toLowerCase();

    if (commandName === 'notepad' || commandName === 'notepad.exe') {
        return true;
    }

    if (!isVsCodeCommandName(commandName)) {
        return false;
    }

    return editor.args.some((argument) => argument === '--wait');
}

function buildEditorNotFoundMessage(command: string): string {
    if (process.platform === 'win32') {
        return `Editor '${command}' was not found. Set VISUAL or EDITOR to a valid command. For VS Code on Windows, use 'code --wait' after adding the VS Code CLI to PATH, or point EDITOR to Code.exe with --wait.`;
    }

    return `Editor '${command}' was not found. Set VISUAL or EDITOR and try again.`;
}

function buildUnsupportedBackgroundEditorMessage(command: string): string {
    return `Concurrent note editing from drafty list is currently supported on Windows with Notepad or VS Code configured with --wait. The current editor '${command}' does not support that workflow.`;
}

async function createEditorDraft(initialContent: string): Promise<{
    tempDir: string;
    draftPath: string;
}> {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'drafty-'));
    const draftPath = path.join(tempDir, 'note.md');

    await writeFile(draftPath, initialContent, 'utf8');

    return { tempDir, draftPath };
}

async function removeEditorDraft(tempDir: string): Promise<void> {
    await rm(tempDir, { recursive: true, force: true });
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
