import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

loadDraftyEnv();

const projectId = resolveProjectId();

if (!projectId) {
    console.error("SUPABASE_PROJECT_ID is required, or run `npx supabase link --project-ref <id>` first.");
    process.exit(1);
}

const outputPath = resolve("src/types/database.types.ts");
const generatedTypes = execSync(
    `npx supabase gen types typescript --project-id ${projectId} --schema public`,
    {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"]
    }
);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, generatedTypes);

function resolveProjectId() {
    const envProjectId = process.env.SUPABASE_PROJECT_ID?.trim();

    if (envProjectId) {
        return envProjectId;
    }

    const linkedProjectPath = resolve("supabase/.temp/project-ref");

    if (!existsSync(linkedProjectPath)) {
        return undefined;
    }

    const linkedProjectId = readFileSync(linkedProjectPath, "utf8").trim();
    return linkedProjectId || undefined;
}

function loadDraftyEnv() {
    loadDotenv({ quiet: true });
    loadDotenv({
        path: join(getConfigRootDirectory(), getDraftyConfigDirectoryName(), ".env"),
        override: false,
        quiet: true,
    });
}

function getConfigRootDirectory() {
    if (process.platform === "win32") {
        return process.env.APPDATA?.trim() || join(os.homedir(), "AppData", "Roaming");
    }

    return process.env.XDG_CONFIG_HOME?.trim() || join(os.homedir(), ".config");
}

function getDraftyConfigDirectoryName() {
    return process.platform === "win32" ? "Drafty" : "drafty";
}
