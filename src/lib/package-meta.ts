import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolves to the package root whether running from src/ (tsx) or dist/ (built)
const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

function readPackageMeta(): { name: string; version: string } {
    const raw = readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as unknown;

    if (
        parsed === null ||
        typeof parsed !== 'object' ||
        typeof (parsed as Record<string, unknown>)['name'] !== 'string' ||
        typeof (parsed as Record<string, unknown>)['version'] !== 'string'
    ) {
        throw new Error('Could not read package metadata from package.json.');
    }

    return {
        name: (parsed as Record<string, unknown>)['name'] as string,
        version: (parsed as Record<string, unknown>)['version'] as string,
    };
}

const { name: PACKAGE_NAME, version: PACKAGE_VERSION } = readPackageMeta();

export { PACKAGE_NAME, PACKAGE_VERSION };
