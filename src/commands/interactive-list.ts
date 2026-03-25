import {
    createPrompt,
    isDownKey,
    isEnterKey,
    isUpKey,
    makeTheme,
    useKeypress,
    useMemo,
    usePrefix,
    useState,
} from '@inquirer/core';
import { styleText, stripVTControlCharacters } from 'node:util';

import {
    formatTimestamp,
    summarizeNoteBody,
    type NoteSummary,
} from '../lib/notes.js';
import { isPromptCancellation } from './interactive-edit.js';

interface NoteSelectionPromptConfig {
    message: string;
    notes: NoteSummary[];
}

const HIDE_CURSOR = '\u001B[?25l';
const PANEL_GAP = '   ';
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})\s+(.*)$/u;
const MARKDOWN_TASK_PATTERN = /^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/u;
const MARKDOWN_BULLET_PATTERN = /^(\s*)[-*+]\s+(.*)$/u;
const MARKDOWN_ORDERED_LIST_PATTERN = /^(\s*)(\d+)\.\s+(.*)$/u;
const MARKDOWN_QUOTE_PATTERN = /^\s*>\s?(.*)$/u;
const MARKDOWN_RULE_PATTERN = /^([-*_]\s*){3,}$/u;
const MARKDOWN_ESCAPED_SYMBOL_PATTERN = /\\([\\`*_{}\[\]()#+\-.!>])/gu;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/gu;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/gu;
const MARKDOWN_INLINE_CODE_PATTERN = /`([^`]+)`/gu;
const MARKDOWN_SUMMARY_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/gmu;
const MARKDOWN_SUMMARY_TASK_PATTERN = /^\s*[-*]\s+\[(?: |x|X)\]\s+/gmu;
const MARKDOWN_SUMMARY_BULLET_PATTERN = /^\s*[-*+]\s+/gmu;
const MARKDOWN_SUMMARY_ORDERED_LIST_PATTERN = /^\s*\d+\.\s+/gmu;
const MARKDOWN_SUMMARY_QUOTE_PATTERN = /^\s*>\s?/gmu;
const MARKDOWN_FENCE_LINE_PATTERN = /^```.*$/gmu;
const TAG_COLORS = [
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
] as const;

const listPromptTheme = {
    style: {
        help: (text: string) => styleText('dim', text),
        label: (text: string) => styleText('bold', text),
        title: (text: string) => styleText('bold', text),
        muted: (text: string) => styleText('dim', text),
        selected: (text: string) => styleText('cyan', text),
        heading: (text: string) => styleText('bold', styleText('underline', text)),
        subheading: (text: string) => styleText('bold', text),
        accent: (text: string) => styleText('cyan', text),
        code: (text: string) => styleText('yellow', text),
        quote: (text: string) => styleText('dim', text),
        rule: (text: string) => styleText('dim', text),
        ellipsis: (text: string) => styleText('dim', text),
    },
};

const noteSelectionPrompt = createPrompt<string, NoteSelectionPromptConfig>(
    (config, done) => {
        const theme = makeTheme(listPromptTheme);
        const [status, setStatus] = useState<'idle' | 'done'>('idle');
        const prefix = usePrefix({ status, theme });
        const notes = useMemo(() => config.notes, [config.notes]);
        const [activeIndex, setActiveIndex] = useState(0);
        const totalWidth = getTerminalWidth();
        const panelWidths = getPanelWidths(totalWidth);
        const maxVisibleNotes = getVisibleNoteCount();

        useKeypress((key, rl) => {
            if (isEnterKey(key)) {
                const selectedNote = notes[activeIndex];

                if (!selectedNote) {
                    return;
                }

                setStatus('done');
                done(selectedNote.id);
                return;
            }

            if (!notes.length) {
                return;
            }

            if (isUpKey(key)) {
                rl.clearLine(0);
                setActiveIndex(activeIndex === 0 ? notes.length - 1 : activeIndex - 1);
                return;
            }

            if (isDownKey(key)) {
                rl.clearLine(0);
                setActiveIndex(activeIndex === notes.length - 1 ? 0 : activeIndex + 1);
            }
        });

        const selectedNote = notes[activeIndex];

        if (!selectedNote) {
            return [prefix, config.message, theme.style.answer('(none)')]
                .filter(Boolean)
                .join(' ');
        }

        const tagBarLines = renderTagBar(
            collectUniqueTags(notes),
            totalWidth,
            theme.style.label,
            theme.style.ellipsis,
        );
        const panelLines = renderPanels({
            notes,
            activeIndex,
            maxVisibleNotes,
            leftWidth: panelWidths.leftWidth,
            rightWidth: panelWidths.rightWidth,
            theme,
        });
        const helpLine = theme.style.help('↑↓ navigate • Enter edit • Ctrl+C cancel');
        const message = theme.style.message(config.message, status);
        const lines = [
            [prefix, message].filter(Boolean).join(' '),
            ...tagBarLines,
            '',
            ...panelLines,
            helpLine,
        ]
            .filter(Boolean)
            .join('\n')
            .trimEnd();

        return `${lines}${HIDE_CURSOR}`;
    },
);

export async function promptForNoteSelection(
    notes: NoteSummary[],
): Promise<string | null> {
    try {
        return await noteSelectionPrompt({
            message: 'Select a note to edit',
            notes,
        });
    } catch (error) {
        if (isPromptCancellation(error)) {
            return null;
        }

        throw error;
    }
}

function renderPanels({
    notes,
    activeIndex,
    maxVisibleNotes,
    leftWidth,
    rightWidth,
    theme,
}: {
    notes: NoteSummary[];
    activeIndex: number;
    maxVisibleNotes: number;
    leftWidth: number;
    rightWidth: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string[] {
    const listLines = renderListPanel({
        notes,
        activeIndex,
        maxVisibleNotes,
        width: leftWidth,
        theme,
    });
    const previewLines = renderPreviewPanel({
        note: notes[activeIndex]!,
        width: rightWidth,
        targetHeight: listLines.length,
        theme,
    });
    const lineCount = Math.max(listLines.length, previewLines.length);
    const mergedLines: string[] = [];

    for (let index = 0; index < lineCount; index += 1) {
        const listLine = listLines[index] ?? '';
        const previewLine = previewLines[index] ?? '';

        mergedLines.push(
            `${padVisible(listLine, leftWidth)}${PANEL_GAP}${padVisible(
                previewLine,
                rightWidth,
            )}`,
        );
    }

    return mergedLines;
}

function renderListPanel({
    notes,
    activeIndex,
    maxVisibleNotes,
    width,
    theme,
}: {
    notes: NoteSummary[];
    activeIndex: number;
    maxVisibleNotes: number;
    width: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string[] {
    const lines = [
        theme.style.title('Notes'),
        theme.style.rule('─'.repeat(width)),
    ];
    const visibleNotes = getVisibleNotes(notes, activeIndex, maxVisibleNotes);
    const summaryWidth = Math.max(16, width - 2);
    const metaWidth = Math.max(12, width - 4);

    for (const { note, index } of visibleNotes) {
        const isActive = index === activeIndex;
        const summary = truncateText(
            summarizeNoteBody(extractPlainTextSummary(note.body), summaryWidth),
            summaryWidth,
        );
        const pointer = isActive ? '❯' : ' ';
        const firstLine = `${pointer} ${summary}`;
        const secondLine = buildNoteMetaLine(note, metaWidth);

        lines.push(isActive ? theme.style.selected(firstLine) : firstLine);
        lines.push(
            isActive
                ? theme.style.selected(`  ${secondLine}`)
                : theme.style.muted(`  ${secondLine}`),
        );
    }

    lines.push('');
    const firstVisibleIndex = visibleNotes[0]?.index ?? 0;
    const lastVisibleIndex = visibleNotes[visibleNotes.length - 1]?.index ?? 0;
    lines.push(
        theme.style.help(
            `Showing ${firstVisibleIndex + 1}-${lastVisibleIndex + 1} of ${notes.length}`,
        ),
    );

    return lines;
}

function renderPreviewPanel({
    note,
    width,
    targetHeight,
    theme,
}: {
    note: NoteSummary;
    width: number;
    targetHeight: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string[] {
    const headerLines = [
        theme.style.title('Preview'),
        theme.style.rule('─'.repeat(width)),
        truncateText(
            `${formatTimestamp(note.created_at)} · ${shortNoteId(note.id)}`,
            width,
        ),
        ...renderInlineTagLine(note.cli_tags, width, theme.style.label),
        '',
    ];
    const bodyHeight = Math.max(6, targetHeight - headerLines.length);
    const bodyLines = renderMarkdownPreview({
        body: note.body,
        width,
        maxLines: bodyHeight,
        theme,
    });
    const previewLines = [...headerLines, ...bodyLines];

    while (previewLines.length < targetHeight) {
        previewLines.push('');
    }

    return previewLines;
}

function renderMarkdownPreview({
    body,
    width,
    maxLines,
    theme,
}: {
    body: string;
    width: number;
    maxLines: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string[] {
    const previewLines: string[] = [];
    const sourceLines = stripControlCharacters(body).replace(/\r\n/gu, '\n').split('\n');
    let isCodeBlock = false;

    for (const sourceLine of sourceLines) {
        if (previewLines.length >= maxLines) {
            break;
        }

        const trimmedLine = sourceLine.trim();

        if (/^```/u.test(trimmedLine)) {
            isCodeBlock = !isCodeBlock;
            appendLines(
                previewLines,
                [theme.style.rule('─'.repeat(width))],
                maxLines,
            );
            continue;
        }

        if (!trimmedLine) {
            previewLines.push('');
            continue;
        }

        if (isCodeBlock) {
            appendWrappedLines(
                previewLines,
                sanitizeInlineMarkdown(sourceLine),
                width,
                maxLines,
                {
                    firstPrefix: '  ',
                    nextPrefix: '  ',
                    style: theme.style.code,
                },
            );
            continue;
        }

        const headingMatch = MARKDOWN_HEADING_PATTERN.exec(trimmedLine);

        if (headingMatch) {
            const [, headingMarkers = '', headingText = ''] = headingMatch;
            const level = headingMarkers.length;
            const text = sanitizeInlineMarkdown(headingText);

            appendWrappedLines(previewLines, text, width, maxLines, {
                style: level === 1 ? theme.style.heading : theme.style.subheading,
            });
            continue;
        }

        const taskMatch = MARKDOWN_TASK_PATTERN.exec(sourceLine);

        if (taskMatch) {
            const [, , checkedMarker = '', taskText = ''] = taskMatch;

            appendWrappedLines(
                previewLines,
                sanitizeInlineMarkdown(taskText),
                width,
                maxLines,
                {
                    firstPrefix: checkedMarker.trim() ? '☑ ' : '☐ ',
                    nextPrefix: '  ',
                    style: checkedMarker.trim() ? theme.style.accent : theme.style.subheading,
                },
            );
            continue;
        }

        const bulletMatch = MARKDOWN_BULLET_PATTERN.exec(sourceLine);

        if (bulletMatch) {
            const [, rawIndent = '', bulletText = ''] = bulletMatch;
            const indent = ' '.repeat(Math.min(4, rawIndent.length));

            appendWrappedLines(
                previewLines,
                sanitizeInlineMarkdown(bulletText),
                width,
                maxLines,
                {
                    firstPrefix: `${indent}• `,
                    nextPrefix: `${indent}  `,
                },
            );
            continue;
        }

        const orderedListMatch = MARKDOWN_ORDERED_LIST_PATTERN.exec(sourceLine);

        if (orderedListMatch) {
            const [, rawIndent = '', orderNumber = '1', orderedText = ''] =
                orderedListMatch;
            const indent = ' '.repeat(Math.min(4, rawIndent.length));
            const marker = `${orderNumber}. `;

            appendWrappedLines(
                previewLines,
                sanitizeInlineMarkdown(orderedText),
                width,
                maxLines,
                {
                    firstPrefix: `${indent}${marker}`,
                    nextPrefix: `${indent}${' '.repeat(marker.length)}`,
                },
            );
            continue;
        }

        const quoteMatch = MARKDOWN_QUOTE_PATTERN.exec(sourceLine);

        if (quoteMatch) {
            const [, quoteText = ''] = quoteMatch;

            appendWrappedLines(
                previewLines,
                sanitizeInlineMarkdown(quoteText),
                width,
                maxLines,
                {
                    firstPrefix: '│ ',
                    nextPrefix: '│ ',
                    style: theme.style.quote,
                },
            );
            continue;
        }

        if (MARKDOWN_RULE_PATTERN.test(trimmedLine)) {
            appendLines(
                previewLines,
                [theme.style.rule('─'.repeat(width))],
                maxLines,
            );
            continue;
        }

        appendWrappedLines(
            previewLines,
            sanitizeInlineMarkdown(trimmedLine),
            width,
            maxLines,
        );
    }

    if (previewLines.length === maxLines && sourceLines.length > previewLines.length) {
        previewLines[maxLines - 1] = theme.style.ellipsis(
            truncateText('…', width),
        );
    }

    return previewLines;
}

function renderTagBar(
    tags: string[],
    width: number,
    labelStyle: (text: string) => string,
    ellipsisStyle: (text: string) => string,
): string[] {
    if (tags.length === 0) {
        return [labelStyle('All tags: (none)')];
    }

    const lines: string[] = [];
    const prefix = 'All tags: ';
    let currentLine = prefix;

    for (const tag of tags) {
        const token = `#${tag}`;
        const separator = currentLine === prefix ? '' : ' ';
        const nextVisibleLength =
            visibleLength(currentLine) + separator.length + token.length;

        if (nextVisibleLength > width && currentLine !== prefix) {
            lines.push(currentLine);
            currentLine = ' '.repeat(prefix.length) + renderTag(tag);
            continue;
        }

        currentLine += `${separator}${renderTag(tag)}`;
    }

    lines.push(currentLine);

    return lines.map((line, index) =>
        index === lines.length - 1 ? line : truncateVisible(line, width, ellipsisStyle),
    );
}

function renderInlineTagLine(
    tags: string[],
    width: number,
    labelStyle: (text: string) => string,
): string[] {
    const prefix = `${labelStyle('Tags:')} `;

    if (tags.length === 0) {
        return [`${prefix}(none)`];
    }

    const lines: string[] = [];
    let currentLine = prefix;

    for (const tag of tags) {
        const token = renderTag(tag);
        const separator = currentLine === prefix ? '' : ' ';

        if (
            visibleLength(currentLine) + separator.length + visibleLength(token) >
                width &&
            currentLine !== prefix
        ) {
            lines.push(currentLine);
            currentLine = ' '.repeat(6) + token;
            continue;
        }

        currentLine += `${separator}${token}`;
    }

    lines.push(currentLine);

    return lines;
}

function buildNoteMetaLine(note: NoteSummary, width: number): string {
    const prefix = `${formatTimestamp(note.created_at)} · `;

    if (note.cli_tags.length === 0) {
        return truncateText(`${prefix}(none)`, width);
    }

    const segments: string[] = [prefix];

    for (const tag of note.cli_tags) {
        const token = renderTag(tag);
        const joined = segments.join('');
        const separator = joined === prefix ? '' : ' ';

        if (
            visibleLength(joined) + separator.length + visibleLength(token) >
            width
        ) {
            segments.push(styleText('dim', ' …'));
            break;
        }

        segments.push(`${separator}${token}`);
    }

    return segments.join('');
}

function getVisibleNotes(
    notes: NoteSummary[],
    activeIndex: number,
    maxVisibleNotes: number,
): Array<{ note: NoteSummary; index: number }> {
    if (notes.length <= maxVisibleNotes) {
        return notes.map((note, index) => ({ note, index }));
    }

    const halfWindow = Math.floor(maxVisibleNotes / 2);
    let startIndex = Math.max(0, activeIndex - halfWindow);
    let endIndex = startIndex + maxVisibleNotes;

    if (endIndex > notes.length) {
        endIndex = notes.length;
        startIndex = endIndex - maxVisibleNotes;
    }

    return notes
        .slice(startIndex, endIndex)
        .map((note, offset) => ({ note, index: startIndex + offset }));
}

function getVisibleNoteCount(): number {
    const rows = process.stdout.rows ?? 24;

    if (rows >= 32) {
        return 8;
    }

    if (rows >= 26) {
        return 7;
    }

    return 6;
}

function getPanelWidths(totalWidth: number): {
    leftWidth: number;
    rightWidth: number;
} {
    const availableWidth = Math.max(72, totalWidth);
    const leftWidth = Math.max(28, Math.min(42, Math.floor(availableWidth * 0.36)));
    const rightWidth = Math.max(
        32,
        availableWidth - leftWidth - visibleLength(PANEL_GAP),
    );

    return { leftWidth, rightWidth };
}

function getTerminalWidth(): number {
    return Math.max(80, process.stdout.columns ?? 120);
}

function collectUniqueTags(notes: NoteSummary[]): string[] {
    return [...new Set(notes.flatMap((note) => note.cli_tags))].sort((left, right) =>
        left.localeCompare(right),
    );
}

function renderTag(tag: string): string {
    const cleanTag = sanitizeInlineMarkdown(tag);
    const colorIndex = Math.abs(hashText(cleanTag)) % TAG_COLORS.length;
    const color = TAG_COLORS[colorIndex];

    if (!color) {
        return `#${cleanTag}`;
    }

    return styleText(color, `#${cleanTag}`);
}

function hashText(value: string): number {
    let hash = 0;

    for (const character of value) {
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }

    return hash;
}

function stripControlCharacters(value: string): string {
    return stripVTControlCharacters(value).replace(
        /[\u0000-\u0008\u000B-\u001A\u001C-\u001F\u007F]/gu,
        '',
    );
}

function sanitizeInlineMarkdown(value: string): string {
    return stripControlCharacters(value)
        .replace(MARKDOWN_ESCAPED_SYMBOL_PATTERN, '$1')
        .replace(MARKDOWN_IMAGE_PATTERN, '$1 [$2]')
        .replace(MARKDOWN_LINK_PATTERN, '$1 ($2)')
        .replace(MARKDOWN_INLINE_CODE_PATTERN, '$1')
        .trim();
}

function extractPlainTextSummary(value: string): string {
    return sanitizeInlineMarkdown(value)
        .replace(MARKDOWN_SUMMARY_HEADING_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_TASK_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_BULLET_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_ORDERED_LIST_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_QUOTE_PATTERN, '')
        .replace(MARKDOWN_FENCE_LINE_PATTERN, '')
        .replace(/\n+/gu, ' ')
        .trim();
}

function appendLines(target: string[], nextLines: string[], maxLines: number): void {
    for (const line of nextLines) {
        if (target.length >= maxLines) {
            return;
        }

        target.push(line);
    }
}

function appendWrappedLines(
    target: string[],
    value: string,
    width: number,
    maxLines: number,
    options: {
        firstPrefix?: string;
        nextPrefix?: string;
        style?: (text: string) => string;
    } = {},
): void {
    const wrappedLines = wrapText(value, width, options);

    if (!options.style) {
        appendLines(target, wrappedLines, maxLines);
        return;
    }

    const style = options.style;
    const styledLines = wrappedLines.map((line) => style(line));

    appendLines(target, styledLines, maxLines);
}

function wrapText(
    value: string,
    width: number,
    options: {
        firstPrefix?: string;
        nextPrefix?: string;
    } = {},
): string[] {
    const firstPrefix = options.firstPrefix ?? '';
    const nextPrefix = options.nextPrefix ?? firstPrefix;
    const normalizedValue = stripControlCharacters(value).replace(/\s+/gu, ' ').trim();

    if (!normalizedValue) {
        return [firstPrefix.trimEnd()];
    }

    const words = normalizedValue.split(' ');
    const lines: string[] = [];
    let currentLine = firstPrefix;
    let currentWidth = visibleLength(firstPrefix);

    for (const word of words) {
        const cleanWord = stripControlCharacters(word);

        if (!cleanWord) {
            continue;
        }

        const activePrefix = lines.length === 0 ? firstPrefix : nextPrefix;
        const maxContentWidth = Math.max(8, width - visibleLength(activePrefix));

        if (cleanWord.length > maxContentWidth) {
            if (currentLine.trim()) {
                lines.push(currentLine);
                currentLine = nextPrefix;
                currentWidth = visibleLength(nextPrefix);
            }

            for (const chunk of chunkWordByWidth(cleanWord, maxContentWidth)) {
                const prefix = lines.length === 0 ? firstPrefix : nextPrefix;
                lines.push(`${prefix}${chunk}`);
            }

            currentLine = nextPrefix;
            currentWidth = visibleLength(nextPrefix);
            continue;
        }

        const separator = currentWidth > visibleLength(activePrefix) ? ' ' : '';
        const nextWidth = currentWidth + separator.length + cleanWord.length;

        if (nextWidth > width && currentLine.trim()) {
            lines.push(currentLine);
            currentLine = `${nextPrefix}${cleanWord}`;
            currentWidth = visibleLength(nextPrefix) + cleanWord.length;
            continue;
        }

        currentLine += `${separator}${cleanWord}`;
        currentWidth = nextWidth;
    }

    if (currentLine.trim()) {
        lines.push(currentLine);
    }

    return lines;
}

function chunkWordByWidth(word: string, width: number): string[] {
    const chunks: string[] = [];

    for (let index = 0; index < word.length; index += width) {
        chunks.push(word.slice(index, index + width));
    }

    return chunks;
}

function truncateText(value: string, width: number): string {
    if (value.length <= width) {
        return value;
    }

    if (width <= 1) {
        return value.slice(0, width);
    }

    return `${value.slice(0, width - 1).trimEnd()}…`;
}

function truncateVisible(
    value: string,
    width: number,
    ellipsisStyle: (text: string) => string,
): string {
    if (visibleLength(value) <= width) {
        return value;
    }

    return `${value.slice(0, Math.max(0, width - 1))}${ellipsisStyle('…')}`;
}

function padVisible(value: string, width: number): string {
    const padding = Math.max(0, width - visibleLength(value));

    return `${value}${' '.repeat(padding)}`;
}

function visibleLength(value: string): number {
    return stripVTControlCharacters(value).length;
}

function shortNoteId(id: string): string {
    return id.slice(0, 8);
}
