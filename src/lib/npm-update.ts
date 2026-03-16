import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { DraftyError } from './errors.js';

export type InstallContext =
    | { type: 'global-npm' }
    | { type: 'npm-link' }
    | { type: 'local-dev' }
    | { type: 'unknown' };

export function detectInstallContext(): InstallContext {
    const scriptArg = process.argv[1];
    if (!scriptArg) return { type: 'unknown' };

    const scriptPath = path.resolve(scriptArg);

    // tsx dev run: entry file has .ts extension
    if (path.extname(scriptPath) === '.ts') {
        return { type: 'local-dev' };
    }

    // Resolve symlinks to detect npm link
    let realPath: string;
    try {
        realPath = fs.realpathSync(scriptPath);
    } catch {
        return { type: 'unknown' };
    }

    // Case-insensitive comparison on Windows for robustness
    const pathsMatch =
        process.platform === 'win32'
            ? realPath.toLowerCase() === scriptPath.toLowerCase()
            : realPath === scriptPath;

    // If realPath differs, the binary is a symlink (npm link)
    if (!pathsMatch) {
        return { type: 'npm-link' };
    }

    // Normalize separators and check for global node_modules install
    const normalizedPath = scriptPath.split(path.sep).join('/');
    if (normalizedPath.includes('/node_modules/drafty-cli/dist/')) {
        return { type: 'global-npm' };
    }

    return { type: 'unknown' };
}

export function resolveNpmCommand(): string {
    return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

export function fetchLatestVersion(packageName: string): string {
    const npmCmd = resolveNpmCommand();
    const result = spawnSync(npmCmd, ['view', packageName, 'version'], {
        encoding: 'utf8',
    });

    if (result.error) {
        if ((result.error as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new DraftyError(
                'npm was not found. Make sure npm is installed and on your PATH.',
            );
        }
        throw new DraftyError(
            `Could not fetch the latest version: ${(result.error as Error).message}`,
        );
    }

    if ((result.status ?? 1) !== 0) {
        throw new DraftyError(
            'Could not fetch the latest version from the npm registry. Check your internet connection.',
        );
    }

    const version = result.stdout.trim();
    if (!version || !/^\d+\.\d+\.\d+/u.test(version)) {
        throw new DraftyError(
            'The npm registry returned an unexpected version format.',
        );
    }

    return version;
}

export function isOutdated(current: string, latest: string): boolean {
    const parse = (v: string): [number, number, number] => {
        const parts = v.trim().replace(/^v/u, '').split('.').map(Number);
        return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
    };

    const [ca, cb, cc] = parse(current);
    const [la, lb, lc] = parse(latest);

    if (la !== ca) return la > ca;
    if (lb !== cb) return lb > cb;
    return lc > cc;
}

export function runNpmUpdate(packageName: string): void {
    const npmCmd = resolveNpmCommand();
    const result = spawnSync(npmCmd, ['update', '-g', packageName], {
        stdio: 'inherit',
    });

    if (result.error) {
        throw new DraftyError(
            `Update failed: ${(result.error as Error).message}. Try running \`npm update -g ${packageName}\` manually.`,
        );
    }

    if ((result.status ?? 1) !== 0) {
        throw new DraftyError(
            `npm exited with status ${result.status ?? 1}. Try running \`npm update -g ${packageName}\` manually.`,
        );
    }
}
