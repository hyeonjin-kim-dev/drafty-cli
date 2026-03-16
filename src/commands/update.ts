import { PACKAGE_NAME, PACKAGE_VERSION } from '../lib/package-meta.js';
import { promptForConfirmation } from '../lib/prompt.js';
import {
    detectInstallContext,
    fetchLatestVersion,
    isOutdated,
    runNpmUpdate,
} from '../lib/npm-update.js';

export async function updateCommand(options: {
    check: boolean;
}): Promise<void> {
    const context = detectInstallContext();

    if (context.type !== 'global-npm') {
        const guidance =
            context.type === 'local-dev'
                ? 'Running from source. To update, run `git pull && npm install` in the repository.'
                : context.type === 'npm-link'
                  ? 'Running via npm link. To update, pull the latest changes in the linked repository.'
                  : 'Could not determine the install context. To update manually, run `npm update -g drafty-cli`.';

        console.log(guidance);
        return;
    }

    console.log(`Checking for updates to ${PACKAGE_NAME}...`);

    const latestVersion = fetchLatestVersion(PACKAGE_NAME);
    const currentVersion = PACKAGE_VERSION;

    if (!isOutdated(currentVersion, latestVersion)) {
        console.log(`Already up to date. (${currentVersion})`);
        return;
    }

    console.log(`Current version: ${currentVersion}`);
    console.log(`Latest version:  ${latestVersion}`);

    if (options.check) {
        console.log(`\nTo update, run: npm update -g ${PACKAGE_NAME}`);
        return;
    }

    const isTTY = process.stdin.isTTY && process.stdout.isTTY;

    if (!isTTY) {
        console.log(`\nTo update, run: npm update -g ${PACKAGE_NAME}`);
        return;
    }

    const confirmed = await promptForConfirmation(
        `Update ${PACKAGE_NAME} to ${latestVersion}?`,
        true,
    );

    if (!confirmed) {
        console.log('Canceled.');
        return;
    }

    console.log(`Updating ${PACKAGE_NAME} to ${latestVersion}...`);
    runNpmUpdate(PACKAGE_NAME);
    console.log(`\nUpdated to ${latestVersion}.`);
}
