export function parseTags(rawTags: string[]): string[] {
    const uniqueTags = new Set<string>();

    for (const rawTag of rawTags) {
        const normalizedTag = rawTag
            .trim()
            .replace(/^#+/u, '')
            .replace(/\s+/gu, '-')
            .toLowerCase();

        if (!normalizedTag) {
            continue;
        }

        uniqueTags.add(normalizedTag);
    }

    return [...uniqueTags];
}
