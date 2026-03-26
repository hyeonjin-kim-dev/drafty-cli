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
import sliceAnsi from 'slice-ansi';
import stringWidth from 'string-width';
import { styleText, stripVTControlCharacters } from 'node:util';

import {
    filterNotesByBodyQuery,
    formatTimestamp,
    normalizeMarkdownForDisplay,
    summarizeNoteBody,
    type NoteSummary,
} from '../lib/notes.js';
import { isPromptCancellation } from './interactive-edit.js';

interface NoteSelectionPromptConfig {
    message: string;
    notes: NoteSummary[];
    initialFilterTag?: string | null;
    initialSearchQuery?: string;
}

export interface NoteSelectionResult {
    action: 'edit' | 'remove';
    noteId: string;
    filterTag: string | null;
    searchQuery: string;
}

type TagFilterValue = string | null;

type TextStyle = (text: string) => string;

interface TagFilterOption {
    label: string;
    value: TagFilterValue;
}

interface InlineSegment {
    text: string;
    style?: TextStyle;
}

interface PreviewPanelState {
    lines: string[];
    maxScrollOffset: number;
    scrollOffset: number;
    bodyViewportHeight: number;
    totalBodyLines: number;
}

const HIDE_CURSOR = '\u001B[?25l';
const PANEL_DIVIDER = ' │ ';
const LIST_ITEM_ICON = '●';
const LIST_ITEM_META_PREFIX = '  ↳ ';
const MARKDOWN_HEADING_PATTERN = /^(#{1,6})\s+(.*)$/u;
const MARKDOWN_TASK_PATTERN = /^(\s*)[-*]\s+\[( |x|X)\]\s+(.*)$/u;
const MARKDOWN_BULLET_PATTERN = /^(\s*)[-*+]\s+(.*)$/u;
const MARKDOWN_ORDERED_LIST_PATTERN = /^(\s*)(\d+)\.\s+(.*)$/u;
const MARKDOWN_QUOTE_PATTERN = /^\s*>\s?(.*)$/u;
const MARKDOWN_RULE_PATTERN = /^([-*_]\s*){3,}$/u;
const MARKDOWN_ESCAPED_SYMBOL_PATTERN = /\\([\\`*_{}\[\]()#+\-.!>~])/gu;
const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)\]\(([^)]+)\)/gu;
const MARKDOWN_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/gu;
const MARKDOWN_INLINE_CODE_PATTERN = /`([^`]+)`/gu;
const MARKDOWN_STRONG_PATTERN = /(\*\*|__)(.+?)\1/gu;
const MARKDOWN_STRIKETHROUGH_PATTERN = /~~(.+?)~~/gu;
const MARKDOWN_EMPHASIS_PATTERN = /(\*|_)(.+?)\1/gu;
const MARKDOWN_INLINE_TOKEN_PATTERN =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|\*([^*]+)\*|_([^_]+)_/gu;
const MARKDOWN_SUMMARY_HEADING_PATTERN = /^\s{0,3}#{1,6}\s+/gmu;
const MARKDOWN_SUMMARY_TASK_PATTERN = /^\s*[-*]\s+\[(?: |x|X)\]\s+/gmu;
const MARKDOWN_SUMMARY_BULLET_PATTERN = /^\s*[-*+]\s+/gmu;
const MARKDOWN_SUMMARY_ORDERED_LIST_PATTERN = /^\s*\d+\.\s+/gmu;
const MARKDOWN_SUMMARY_QUOTE_PATTERN = /^\s*>\s?/gmu;
const MARKDOWN_FENCE_LINE_PATTERN = /^```.*$/gmu;
const ANSI_FOREGROUND_RESET = '\u001B[39m';
const PANEL_CHROME_LINES = 3;
const LIST_PANEL_FIXED_LINES = 4;
const GRAPHEME_SEGMENTER = new Intl.Segmenter(undefined, {
    granularity: 'grapheme',
});
const TAG_FALLBACK_COLOR_CODES = [
    45, 51, 39, 33, 69, 99, 135, 177, 201, 198, 197, 203, 209, 215, 221, 227,
    154, 118, 49, 50, 43, 87,
] as const;

const listPromptTheme = {
    style: {
        help: (text: string) => styleText('dim', text),
        label: (text: string) => styleText('bold', text),
        title: (text: string) => styleText('bold', text),
        muted: (text: string) => styleText('dim', text),
        selected: (text: string) => styleText('cyan', text),
        heading: (text: string) =>
            styleText('bold', styleText('underline', text)),
        subheading: (text: string) => styleText('bold', text),
        accent: (text: string) => styleText('cyan', text),
        code: (text: string) => styleText('yellow', text),
        quote: (text: string) => styleText('dim', text),
        rule: (text: string) => styleText('dim', text),
        ellipsis: (text: string) => styleText('dim', text),
        strong: (text: string) => styleText('bold', text),
        emphasis: (text: string) => styleText('italic', text),
        strikethrough: (text: string) =>
            styleText('strikethrough', styleText('dim', text)),
        link: (text: string) => styleText('underline', styleText('cyan', text)),
        image: (text: string) => styleText('magentaBright', text),
    },
};

const noteSelectionPrompt = createPrompt<
    NoteSelectionResult,
    NoteSelectionPromptConfig
>((config, done) => {
    const theme = makeTheme(listPromptTheme);
    const [status, setStatus] = useState<'idle' | 'done'>('idle');
    const prefix = usePrefix({ status, theme });
    const notes = useMemo(() => config.notes, [config.notes]);
    const tagFilterOptions = useMemo(
        () => buildTagFilterOptions(notes),
        [notes],
    );
    const [activeIndex, setActiveIndex] = useState(0);
    const [activeTagIndex, setActiveTagIndex] = useState(() =>
        findTagFilterIndex(
            tagFilterOptions,
            resolveAvailableTagFilter(
                config.initialFilterTag ?? null,
                tagFilterOptions,
            ),
        ),
    );
    const [searchQuery, setSearchQuery] = useState(
        config.initialSearchQuery ?? '',
    );
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [previewScrollOffset, setPreviewScrollOffset] = useState(0);
    const totalWidth = getTerminalWidth();
    const panelWidths = getPanelWidths(totalWidth);
    const activeTagFilter = tagFilterOptions[activeTagIndex]?.value ?? null;
    const filteredNotes = filterNotesByBodyQuery(
        filterNotesByTag(notes, activeTagFilter),
        searchQuery,
    );
    const clampedActiveIndex = clampActiveIndex(
        activeIndex,
        filteredNotes.length,
    );
    const selectedNote = filteredNotes[clampedActiveIndex];
    const tagBarLines = renderTagBar({
        options: tagFilterOptions,
        activeIndex: activeTagIndex,
        width: totalWidth,
        theme,
    });
    const searchLine = renderSearchLine({
        query: searchQuery,
        isEditing: isSearchMode,
        width: totalWidth,
        theme,
    });
    const panelHeight = getPanelHeight(tagBarLines.length + 1);
    const maxVisibleNotes = getVisibleNoteCount(panelHeight);
    const previewPanel = selectedNote
        ? renderPreviewPanel({
              note: selectedNote,
              width: panelWidths.rightWidth,
              targetHeight: panelHeight,
              scrollOffset: previewScrollOffset,
              theme,
          })
        : renderEmptyPreviewPanel({
              width: panelWidths.rightWidth,
              targetHeight: panelHeight,
              hasActiveFilters:
                  activeTagFilter !== null || searchQuery.trim().length > 0,
              theme,
          });
    const previewScrollStep = getPreviewScrollStep(
        previewPanel?.bodyViewportHeight ?? 0,
    );

    useKeypress((key, rl) => {
        if (isSearchMode) {
            if (isEnterKey(key) || isEscapeKey(key)) {
                rl.clearLine(0);
                setIsSearchMode(false);
                return;
            }

            if (isBackspaceKey(key)) {
                if (!searchQuery) {
                    return;
                }

                rl.clearLine(0);
                setPreviewScrollOffset(0);
                setActiveIndex(0);
                setSearchQuery(searchQuery.slice(0, -1));
                return;
            }

            const nextSearchCharacter = getSearchInputCharacter(key);

            if (nextSearchCharacter !== null) {
                rl.clearLine(0);
                setPreviewScrollOffset(0);
                setActiveIndex(0);
                setSearchQuery(`${searchQuery}${nextSearchCharacter}`);
            }

            return;
        }

        if (isEnterKey(key)) {
            const selectedNote = filteredNotes[clampedActiveIndex];

            if (!selectedNote) {
                return;
            }

            setStatus('done');
            done({
                action: 'edit',
                noteId: selectedNote.id,
                filterTag: activeTagFilter,
                searchQuery,
            });
            return;
        }

        if (isSearchShortcutKey(key)) {
            rl.clearLine(0);
            setIsSearchMode(true);
            return;
        }

        if (isPreviousTagKey(key)) {
            rl.clearLine(0);
            setPreviewScrollOffset(0);
            setActiveIndex(0);
            setActiveTagIndex(
                activeTagIndex === 0
                    ? tagFilterOptions.length - 1
                    : activeTagIndex - 1,
            );
            return;
        }

        if (isNextTagKey(key)) {
            rl.clearLine(0);
            setPreviewScrollOffset(0);
            setActiveIndex(0);
            setActiveTagIndex(
                activeTagIndex === tagFilterOptions.length - 1
                    ? 0
                    : activeTagIndex + 1,
            );
            return;
        }

        if (!filteredNotes.length) {
            return;
        }

        if (isUpKey(key)) {
            rl.clearLine(0);
            setPreviewScrollOffset(0);
            setActiveIndex(
                clampedActiveIndex === 0
                    ? filteredNotes.length - 1
                    : clampedActiveIndex - 1,
            );
            return;
        }

        if (isDownKey(key)) {
            rl.clearLine(0);
            setPreviewScrollOffset(0);
            setActiveIndex(
                clampedActiveIndex === filteredNotes.length - 1
                    ? 0
                    : clampedActiveIndex + 1,
            );
            return;
        }

        if (isPageUpKey(key)) {
            if (!previewPanel || previewPanel.maxScrollOffset === 0) {
                return;
            }

            rl.clearLine(0);
            setPreviewScrollOffset(
                Math.max(0, previewPanel.scrollOffset - previewScrollStep),
            );
            return;
        }

        if (isPageDownKey(key)) {
            if (!previewPanel || previewPanel.maxScrollOffset === 0) {
                return;
            }

            rl.clearLine(0);
            setPreviewScrollOffset(
                Math.min(
                    previewPanel.maxScrollOffset,
                    previewPanel.scrollOffset + previewScrollStep,
                ),
            );
            return;
        }

        if (isHomeKey(key)) {
            if (!previewPanel || previewPanel.maxScrollOffset === 0) {
                return;
            }

            rl.clearLine(0);
            setPreviewScrollOffset(0);
            return;
        }

        if (isEndKey(key)) {
            if (!previewPanel || previewPanel.maxScrollOffset === 0) {
                return;
            }

            rl.clearLine(0);
            setPreviewScrollOffset(previewPanel.maxScrollOffset);
            return;
        }

        if (isRemoveKey(key)) {
            const selectedNote = filteredNotes[clampedActiveIndex];

            if (!selectedNote) {
                return;
            }

            setStatus('done');
            done({
                action: 'remove',
                noteId: selectedNote.id,
                filterTag: activeTagFilter,
                searchQuery,
            });
        }
    });

    const panelLines = renderPanels({
        notes: filteredNotes,
        activeIndex: clampedActiveIndex,
        maxVisibleNotes,
        leftWidth: panelWidths.leftWidth,
        rightWidth: panelWidths.rightWidth,
        targetHeight: panelHeight,
        previewLines: previewPanel?.lines ?? [],
        theme,
    });
    const helpLine = buildHelpLine(
        theme,
        (previewPanel?.maxScrollOffset ?? 0) > 0,
        isSearchMode,
    );
    const message = theme.style.message(config.message, status);
    const lines = [
        [prefix, message].filter(Boolean).join(' '),
        ...tagBarLines,
        searchLine,
        '',
        ...panelLines,
        helpLine,
    ]
        .filter(Boolean)
        .join('\n')
        .trimEnd();

    return `${lines}${HIDE_CURSOR}`;
});

export async function promptForNoteSelection(
    notes: NoteSummary[],
    initialFilterTag: TagFilterValue = null,
    initialSearchQuery = '',
): Promise<NoteSelectionResult | null> {
    try {
        return await noteSelectionPrompt({
            message: 'Select a note to edit, remove, or search',
            notes,
            initialFilterTag,
            initialSearchQuery,
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
    targetHeight,
    previewLines,
    theme,
}: {
    notes: NoteSummary[];
    activeIndex: number;
    maxVisibleNotes: number;
    leftWidth: number;
    rightWidth: number;
    targetHeight: number;
    previewLines: string[];
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string[] {
    const listLines = renderListPanel({
        notes,
        activeIndex,
        maxVisibleNotes,
        width: leftWidth,
        targetHeight,
        theme,
    });
    const lineCount = Math.max(
        targetHeight,
        listLines.length,
        previewLines.length,
    );
    const mergedLines: string[] = [];
    const divider = renderPanelDivider(theme);

    for (let index = 0; index < lineCount; index += 1) {
        const listLine = fitPanelLine(
            listLines[index] ?? '',
            leftWidth,
            theme.style.ellipsis,
        );
        const previewLine = fitPanelLine(
            previewLines[index] ?? '',
            rightWidth,
            theme.style.ellipsis,
        );

        mergedLines.push(
            `${padVisible(listLine, leftWidth)}${divider}${padVisible(previewLine, rightWidth)}`,
        );
    }

    return mergedLines;
}

function renderListPanel({
    notes,
    activeIndex,
    maxVisibleNotes,
    width,
    targetHeight,
    theme,
}: {
    notes: NoteSummary[];
    activeIndex: number;
    maxVisibleNotes: number;
    width: number;
    targetHeight: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string[] {
    const lines = [
        theme.style.title('Notes'),
        theme.style.rule('─'.repeat(width)),
    ];
    const visibleNotes = getVisibleNotes(notes, activeIndex, maxVisibleNotes);
    const noteAreaHeight = Math.max(0, targetHeight - LIST_PANEL_FIXED_LINES);
    const summaryWidth = Math.max(
        14,
        width - visibleLength(getListItemSummaryPrefix(false)),
    );
    const metaWidth = Math.max(
        10,
        width - visibleLength(LIST_ITEM_META_PREFIX),
    );

    for (const { note, index } of visibleNotes) {
        const isActive = index === activeIndex;
        const summary = truncateText(
            summarizeNoteBody(extractPlainTextSummary(note.body), summaryWidth),
            summaryWidth,
        );
        const firstLine = `${getListItemSummaryPrefix(isActive)}${summary}`;
        const secondLine = `${LIST_ITEM_META_PREFIX}${buildNoteMetaLine(note, metaWidth)}`;

        lines.push(isActive ? theme.style.selected(firstLine) : firstLine);
        lines.push(
            isActive
                ? theme.style.selected(secondLine)
                : theme.style.muted(secondLine),
        );
    }

    if (visibleNotes.length === 0) {
        lines.push(theme.style.muted('No notes match the current filters.'));
    }

    while (lines.length < 2 + noteAreaHeight) {
        lines.push('');
    }

    lines.push('');
    if (visibleNotes.length === 0) {
        lines.push(theme.style.help('Showing 0 of 0'));
        return lines;
    }

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
    scrollOffset,
    theme,
}: {
    note: NoteSummary;
    width: number;
    targetHeight: number;
    scrollOffset: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): PreviewPanelState {
    const tagLines = renderInlineTagLine(
        note.cli_tags,
        width,
        theme.style.label,
    );
    const headerLineCount = 4 + tagLines.length;
    const bodyViewportHeight = Math.max(6, targetHeight - headerLineCount);
    const allBodyLines = renderMarkdownPreview({
        body: note.body,
        width,
        maxLines: Number.MAX_SAFE_INTEGER,
        theme,
    });
    const maxScrollOffset = Math.max(
        0,
        allBodyLines.length - bodyViewportHeight,
    );
    const clampedScrollOffset = Math.min(scrollOffset, maxScrollOffset);
    const headerLines = [
        buildPreviewTitle({
            width,
            totalBodyLines: allBodyLines.length,
            bodyViewportHeight,
            scrollOffset: clampedScrollOffset,
            theme,
        }),
        theme.style.rule('─'.repeat(width)),
        truncateText(
            `${formatTimestamp(note.created_at)} · ${shortNoteId(note.id)}`,
            width,
        ),
        ...tagLines,
        '',
    ];
    const previewLines = [
        ...headerLines,
        ...allBodyLines.slice(
            clampedScrollOffset,
            clampedScrollOffset + bodyViewportHeight,
        ),
    ];

    while (previewLines.length < targetHeight) {
        previewLines.push('');
    }

    return {
        lines: previewLines,
        maxScrollOffset,
        scrollOffset: clampedScrollOffset,
        bodyViewportHeight,
        totalBodyLines: allBodyLines.length,
    };
}

function renderEmptyPreviewPanel({
    width,
    targetHeight,
    hasActiveFilters,
    theme,
}: {
    width: number;
    targetHeight: number;
    hasActiveFilters: boolean;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): PreviewPanelState {
    const previewLines = [
        theme.style.title('Preview'),
        theme.style.rule('─'.repeat(width)),
        '',
        theme.style.muted(
            hasActiveFilters
                ? 'No notes match the current filters.'
                : 'No note selected.',
        ),
    ];

    while (previewLines.length < targetHeight) {
        previewLines.push('');
    }

    return {
        lines: previewLines,
        maxScrollOffset: 0,
        scrollOffset: 0,
        bodyViewportHeight: Math.max(0, targetHeight - 4),
        totalBodyLines: 0,
    };
}

function renderSearchLine({
    query,
    isEditing,
    width,
    theme,
}: {
    query: string;
    isEditing: boolean;
    width: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string {
    const label = `${theme.style.label('Search:')} `;
    const value = query
        ? theme.style.accent(query)
        : theme.style.muted('(none)');
    const suffix = isEditing
        ? theme.style.selected('|')
        : theme.style.help(
              query ? '  (press s or / to edit)' : '  (press s or / to search)',
          );

    return fitPanelLine(
        `${label}${value}${suffix}`,
        width,
        theme.style.ellipsis,
    );
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
    const sourceLines = stripControlCharacters(
        normalizeMarkdownForDisplay(body),
    )
        .replace(/\r\n/gu, '\n')
        .split('\n');
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
                stripControlCharacters(sourceLine),
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

            appendWrappedMarkdownLines(
                previewLines,
                headingText,
                width,
                maxLines,
                theme,
                {
                    style:
                        level === 1
                            ? theme.style.heading
                            : theme.style.subheading,
                },
            );
            continue;
        }

        const taskMatch = MARKDOWN_TASK_PATTERN.exec(sourceLine);

        if (taskMatch) {
            const [, , checkedMarker = '', taskText = ''] = taskMatch;

            appendWrappedMarkdownLines(
                previewLines,
                taskText,
                width,
                maxLines,
                theme,
                {
                    firstPrefix: checkedMarker.trim() ? '☑ ' : '☐ ',
                    nextPrefix: '  ',
                    style: checkedMarker.trim()
                        ? theme.style.accent
                        : theme.style.subheading,
                },
            );
            continue;
        }

        const bulletMatch = MARKDOWN_BULLET_PATTERN.exec(sourceLine);

        if (bulletMatch) {
            const [, rawIndent = '', bulletText = ''] = bulletMatch;
            const indent = ' '.repeat(Math.min(4, rawIndent.length));

            appendWrappedMarkdownLines(
                previewLines,
                bulletText,
                width,
                maxLines,
                theme,
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

            appendWrappedMarkdownLines(
                previewLines,
                orderedText,
                width,
                maxLines,
                theme,
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

            appendWrappedMarkdownLines(
                previewLines,
                quoteText,
                width,
                maxLines,
                theme,
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

        appendWrappedMarkdownLines(
            previewLines,
            trimmedLine,
            width,
            maxLines,
            theme,
        );
    }

    if (
        previewLines.length === maxLines &&
        sourceLines.length > previewLines.length
    ) {
        previewLines[maxLines - 1] = theme.style.ellipsis(
            truncateText('…', width),
        );
    }

    return previewLines;
}

function renderTagBar({
    options,
    activeIndex,
    width,
    theme,
}: {
    options: TagFilterOption[];
    activeIndex: number;
    width: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string[] {
    const prefix = `${theme.style.label('Filter:')} `;

    if (options.length === 0) {
        return [`${prefix}${theme.style.muted('(none)')}`];
    }

    const lines: string[] = [];
    const continuationPrefix = ' '.repeat(visibleLength(prefix));
    let currentLine = prefix;

    for (const [index, option] of options.entries()) {
        const token = renderTagFilterToken(
            option,
            index === activeIndex,
            theme,
        );
        const separator = currentLine === prefix ? '' : ' ';
        const nextVisibleLength =
            visibleLength(currentLine) +
            separator.length +
            visibleLength(token);

        if (nextVisibleLength > width && currentLine !== prefix) {
            lines.push(fitPanelLine(currentLine, width, theme.style.ellipsis));
            currentLine = `${continuationPrefix}${token}`;
            continue;
        }

        currentLine += `${separator}${token}`;
    }

    lines.push(fitPanelLine(currentLine, width, theme.style.ellipsis));

    return lines;
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
            visibleLength(currentLine) +
                separator.length +
                visibleLength(token) >
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
    const overflowSuffix = styleText('dim', ' …');

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
            segments.push(
                truncateVisible(
                    overflowSuffix,
                    Math.max(1, width - visibleLength(joined)),
                    (text) => text,
                ),
            );
            break;
        }

        segments.push(`${separator}${token}`);
    }

    return segments.join('');
}

function renderPanelDivider(
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>,
): string {
    return ` ${theme.style.rule('│')} `;
}

function getListItemSummaryPrefix(isActive: boolean): string {
    const pointer = isActive ? '❯' : ' ';

    return `${pointer} ${LIST_ITEM_ICON} `;
}

function buildPreviewTitle({
    width,
    totalBodyLines,
    bodyViewportHeight,
    scrollOffset,
    theme,
}: {
    width: number;
    totalBodyLines: number;
    bodyViewportHeight: number;
    scrollOffset: number;
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>;
}): string {
    const title = theme.style.title('Preview');

    if (totalBodyLines <= bodyViewportHeight || totalBodyLines === 0) {
        return title;
    }

    const visibleEnd = Math.min(
        totalBodyLines,
        scrollOffset + bodyViewportHeight,
    );
    const progress = theme.style.help(
        ` ${scrollOffset + 1}-${visibleEnd}/${totalBodyLines}`,
    );

    return truncateVisible(`${title}${progress}`, width, theme.style.ellipsis);
}

function buildHelpLine(
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>,
    canScrollPreview: boolean,
    isSearchMode: boolean,
): string {
    if (isSearchMode) {
        return theme.style.help(
            'Search mode • type to filter body • Enter finish • Backspace delete • Esc stop',
        );
    }

    const baseHelp =
        's or / search • ←→/Tab tag • ↑↓ note • d/Delete remove • Enter edit • Ctrl+C cancel';

    if (!canScrollPreview) {
        return theme.style.help(baseHelp);
    }

    return theme.style.help(
        's or / search • ←→/Tab tag • ↑↓ note • PgUp/PgDn preview • d/Delete remove • Enter edit • Ctrl+C cancel',
    );
}

function getPreviewScrollStep(bodyViewportHeight: number): number {
    return Math.max(1, bodyViewportHeight - 2);
}

function isPageUpKey(key: { name?: string }): boolean {
    return key.name === 'pageup';
}

function isPageDownKey(key: { name?: string }): boolean {
    return key.name === 'pagedown';
}

function isHomeKey(key: { name?: string }): boolean {
    return key.name === 'home';
}

function isEndKey(key: { name?: string }): boolean {
    return key.name === 'end';
}

function isEscapeKey(key: { name?: string }): boolean {
    return key.name === 'escape';
}

function isBackspaceKey(key: { name?: string }): boolean {
    return key.name === 'backspace';
}

function isSearchShortcutKey(key: {
    name?: string;
    sequence?: string;
}): boolean {
    return (
        key.name === 's' ||
        key.sequence === 's' ||
        key.name === 'slash' ||
        key.sequence === '/'
    );
}

function isPreviousTagKey(key: {
    name?: string;
    sequence?: string;
    shift?: boolean;
}): boolean {
    return (
        key.name === 'left' ||
        key.sequence === '\u001B[Z' ||
        (key.name === 'tab' && key.shift === true)
    );
}

function isNextTagKey(key: {
    name?: string;
    sequence?: string;
    shift?: boolean;
}): boolean {
    return (
        key.name === 'right' ||
        ((key.name === 'tab' || key.sequence === '\t') &&
            key.sequence !== '\u001B[Z' &&
            key.shift !== true)
    );
}

function isRemoveKey(key: { name?: string; sequence?: string }): boolean {
    return key.name === 'delete' || key.name === 'd' || key.sequence === 'd';
}

function getSearchInputCharacter(key: {
    sequence?: string;
    ctrl?: boolean;
    meta?: boolean;
}): string | null {
    if (!key.sequence || key.ctrl || key.meta) {
        return null;
    }

    if (
        key.sequence === '\r' ||
        key.sequence === '\n' ||
        key.sequence === '\t'
    ) {
        return null;
    }

    return key.sequence.length === 1 ? key.sequence : null;
}

function clampActiveIndex(activeIndex: number, noteCount: number): number {
    if (noteCount <= 0) {
        return 0;
    }

    return Math.max(0, Math.min(activeIndex, noteCount - 1));
}

function filterNotesByTag(
    notes: NoteSummary[],
    filterTag: TagFilterValue,
): NoteSummary[] {
    if (!filterTag) {
        return notes;
    }

    return notes.filter((note) => note.cli_tags.includes(filterTag));
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

function getVisibleNoteCount(panelHeight: number): number {
    const availableRows = Math.max(0, panelHeight - LIST_PANEL_FIXED_LINES);

    return Math.max(4, Math.floor(availableRows / 2));
}

function getPanelHeight(tagBarLineCount: number): number {
    const rows = process.stdout.rows ?? 24;
    const availableRows = rows - tagBarLineCount - PANEL_CHROME_LINES;

    return Math.max(12, availableRows);
}

function getPanelWidths(totalWidth: number): {
    leftWidth: number;
    rightWidth: number;
} {
    const availableWidth = Math.max(72, totalWidth);
    const leftWidth = Math.max(
        28,
        Math.min(42, Math.floor(availableWidth * 0.36)),
    );
    const rightWidth = Math.max(
        32,
        availableWidth - leftWidth - visibleLength(PANEL_DIVIDER),
    );

    return { leftWidth, rightWidth };
}

function getTerminalWidth(): number {
    return Math.max(80, process.stdout.columns ?? 120);
}

function collectUniqueTags(notes: NoteSummary[]): string[] {
    return [...new Set(notes.flatMap((note) => note.cli_tags))].sort(
        (left, right) => left.localeCompare(right),
    );
}

function buildTagFilterOptions(notes: NoteSummary[]): TagFilterOption[] {
    return [
        { label: 'All', value: null },
        ...collectUniqueTags(notes).map((tag) => ({ label: tag, value: tag })),
    ];
}

function resolveAvailableTagFilter(
    filterTag: TagFilterValue,
    options: TagFilterOption[],
): TagFilterValue {
    if (!filterTag) {
        return null;
    }

    return options.some((option) => option.value === filterTag)
        ? filterTag
        : null;
}

function findTagFilterIndex(
    options: TagFilterOption[],
    filterTag: TagFilterValue,
): number {
    const index = options.findIndex((option) => option.value === filterTag);

    return index >= 0 ? index : 0;
}

function renderTagFilterToken(
    option: TagFilterOption,
    isActive: boolean,
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>,
): string {
    if (option.value === null) {
        const label = option.label;

        return isActive
            ? theme.style.selected(`[${label}]`)
            : theme.style.label(label);
    }

    const tagToken = renderTag(option.label);

    if (!isActive) {
        return tagToken;
    }

    return `${theme.style.selected('[')}${tagToken}${theme.style.selected(']')}`;
}

function renderTag(tag: string): string {
    const cleanTag = sanitizeInlineMarkdown(tag);
    const tagText = `#${cleanTag}`;

    if (!cleanTag) {
        return tagText;
    }

    return colorizeTag(tagText, hashText(cleanTag));
}

function hashText(value: string): number {
    let hash = 2166136261;

    for (const character of value) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16777619);
    }

    return hash >>> 0;
}

function colorizeTag(text: string, hash: number): string {
    if (!process.stdout.isTTY || !process.stdout.hasColors?.()) {
        return text;
    }

    const colorDepth = process.stdout.getColorDepth?.() ?? 1;

    if (colorDepth >= 24) {
        const { red, green, blue } = buildTrueColorFromHash(hash);

        return `\u001B[38;2;${red};${green};${blue}m${text}${ANSI_FOREGROUND_RESET}`;
    }

    if (colorDepth >= 8) {
        const colorCode =
            TAG_FALLBACK_COLOR_CODES[hash % TAG_FALLBACK_COLOR_CODES.length];

        if (colorCode !== undefined) {
            return `\u001B[38;5;${colorCode}m${text}${ANSI_FOREGROUND_RESET}`;
        }
    }

    return styleText('cyanBright', text);
}

function buildTrueColorFromHash(hash: number): {
    red: number;
    green: number;
    blue: number;
} {
    const hue = hash % 360;
    const saturation = 0.84 + ((hash >>> 9) % 12) / 100;
    const lightness = 0.58 + ((hash >>> 17) % 8) / 100;

    return hslToRgb(hue, saturation, lightness);
}

function hslToRgb(
    hue: number,
    saturation: number,
    lightness: number,
): {
    red: number;
    green: number;
    blue: number;
} {
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const normalizedHue = hue / 60;
    const secondary = chroma * (1 - Math.abs((normalizedHue % 2) - 1));
    let redPrime = 0;
    let greenPrime = 0;
    let bluePrime = 0;

    if (normalizedHue >= 0 && normalizedHue < 1) {
        redPrime = chroma;
        greenPrime = secondary;
    } else if (normalizedHue < 2) {
        redPrime = secondary;
        greenPrime = chroma;
    } else if (normalizedHue < 3) {
        greenPrime = chroma;
        bluePrime = secondary;
    } else if (normalizedHue < 4) {
        greenPrime = secondary;
        bluePrime = chroma;
    } else if (normalizedHue < 5) {
        redPrime = secondary;
        bluePrime = chroma;
    } else {
        redPrime = chroma;
        bluePrime = secondary;
    }

    const match = lightness - chroma / 2;

    return {
        red: Math.round((redPrime + match) * 255),
        green: Math.round((greenPrime + match) * 255),
        blue: Math.round((bluePrime + match) * 255),
    };
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
        .replace(MARKDOWN_STRONG_PATTERN, '$2')
        .replace(MARKDOWN_STRIKETHROUGH_PATTERN, '$1')
        .replace(MARKDOWN_EMPHASIS_PATTERN, '$2')
        .trim();
}

function extractPlainTextSummary(value: string): string {
    return sanitizeInlineMarkdown(normalizeMarkdownForDisplay(value))
        .replace(MARKDOWN_SUMMARY_HEADING_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_TASK_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_BULLET_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_ORDERED_LIST_PATTERN, '')
        .replace(MARKDOWN_SUMMARY_QUOTE_PATTERN, '')
        .replace(MARKDOWN_FENCE_LINE_PATTERN, '')
        .replace(/\n+/gu, ' ')
        .trim();
}

function appendLines(
    target: string[],
    nextLines: string[],
    maxLines: number,
): void {
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

function appendWrappedMarkdownLines(
    target: string[],
    value: string,
    width: number,
    maxLines: number,
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>,
    options: {
        firstPrefix?: string;
        nextPrefix?: string;
        style?: TextStyle;
    } = {},
): void {
    appendLines(
        target,
        wrapMarkdownText(value, width, theme, options),
        maxLines,
    );
}

function wrapMarkdownText(
    value: string,
    width: number,
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>,
    options: {
        firstPrefix?: string;
        nextPrefix?: string;
        style?: TextStyle;
    } = {},
): string[] {
    const firstPrefix = options.firstPrefix ?? '';
    const nextPrefix = options.nextPrefix ?? firstPrefix;
    const normalizedValue = normalizeInlineMarkdownText(value);

    if (!normalizedValue) {
        return [firstPrefix.trimEnd()];
    }

    const segments = expandInlineSegments(
        tokenizeInlineMarkdown(normalizedValue, theme),
    );
    const lines: string[] = [];
    let currentLine = firstPrefix;
    let currentWidth = visibleLength(firstPrefix);
    let pendingWhitespace = false;

    for (const segment of segments) {
        if (segment.text === ' ') {
            pendingWhitespace =
                currentWidth >
                visibleLength(lines.length === 0 ? firstPrefix : nextPrefix);
            continue;
        }

        const activePrefix = lines.length === 0 ? firstPrefix : nextPrefix;
        const prefixWidth = visibleLength(activePrefix);
        const segmentWidth = visibleLength(segment.text);
        const maxContentWidth = Math.max(8, width - prefixWidth);

        if (segmentWidth > maxContentWidth) {
            if (currentWidth > prefixWidth) {
                lines.push(currentLine);
                currentLine = nextPrefix;
                currentWidth = visibleLength(nextPrefix);
            }

            for (const chunk of chunkInlineSegmentByWidth(
                segment,
                maxContentWidth,
            )) {
                const prefix = lines.length === 0 ? firstPrefix : nextPrefix;
                lines.push(
                    `${prefix}${applyInlineStyle(chunk, options.style)}`,
                );
            }

            currentLine = nextPrefix;
            currentWidth = visibleLength(nextPrefix);
            pendingWhitespace = false;
            continue;
        }

        const spaceWidth =
            pendingWhitespace && currentWidth > prefixWidth ? 1 : 0;

        if (
            currentWidth + spaceWidth + segmentWidth > width &&
            currentWidth > prefixWidth
        ) {
            lines.push(currentLine);
            currentLine = nextPrefix;
            currentWidth = visibleLength(nextPrefix);
            pendingWhitespace = false;
        }

        if (pendingWhitespace && currentWidth > prefixWidth) {
            currentLine += ' ';
            currentWidth += 1;
            pendingWhitespace = false;
        }

        currentLine += applyInlineStyle(segment, options.style);
        currentWidth += segmentWidth;
    }

    if (currentLine.trim()) {
        lines.push(currentLine);
    }

    return lines;
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
    const normalizedValue = stripControlCharacters(value)
        .replace(/\s+/gu, ' ')
        .trim();

    if (!normalizedValue) {
        return [firstPrefix.trimEnd()];
    }

    const words = normalizedValue.split(' ');
    const lines: string[] = [];
    let currentLine = firstPrefix;
    let currentWidth = visibleLength(firstPrefix);

    for (const word of words) {
        const cleanWord = stripControlCharacters(word);
        const cleanWordWidth = visibleLength(cleanWord);

        if (!cleanWord) {
            continue;
        }

        const activePrefix = lines.length === 0 ? firstPrefix : nextPrefix;
        const maxContentWidth = Math.max(
            8,
            width - visibleLength(activePrefix),
        );

        if (cleanWordWidth > maxContentWidth) {
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
        const nextWidth = currentWidth + separator.length + cleanWordWidth;

        if (nextWidth > width && currentLine.trim()) {
            lines.push(currentLine);
            currentLine = `${nextPrefix}${cleanWord}`;
            currentWidth = visibleLength(nextPrefix) + cleanWordWidth;
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

function normalizeInlineMarkdownText(value: string): string {
    return stripControlCharacters(value).replace(/\s+/gu, ' ').trim();
}

function tokenizeInlineMarkdown(
    value: string,
    theme: ReturnType<typeof makeTheme<typeof listPromptTheme>>,
): InlineSegment[] {
    const segments: InlineSegment[] = [];
    const sanitizedValue = value.replace(MARKDOWN_ESCAPED_SYMBOL_PATTERN, '$1');
    let lastIndex = 0;

    for (const match of sanitizedValue.matchAll(
        MARKDOWN_INLINE_TOKEN_PATTERN,
    )) {
        const matchIndex = match.index ?? 0;

        if (matchIndex > lastIndex) {
            segments.push({
                text: sanitizedValue.slice(lastIndex, matchIndex),
            });
        }

        const [fullMatch = ''] = match;
        const [
            ,
            imageAlt = '',
            imageUrl = '',
            linkText = '',
            linkUrl = '',
            inlineCode = '',
            strongAsterisk = '',
            strongUnderscore = '',
            strikeText = '',
            emphasisAsterisk = '',
            emphasisUnderscore = '',
        ] = match;

        if (imageUrl) {
            const imageText = imageAlt.trim()
                ? `${imageAlt} [${imageUrl}]`
                : `[image] [${imageUrl}]`;
            segments.push({ text: imageText, style: theme.style.image });
        } else if (linkUrl) {
            segments.push({
                text: `${linkText} (${linkUrl})`,
                style: theme.style.link,
            });
        } else if (inlineCode) {
            segments.push({ text: inlineCode, style: theme.style.code });
        } else if (strongAsterisk || strongUnderscore) {
            segments.push({
                text: strongAsterisk || strongUnderscore,
                style: theme.style.strong,
            });
        } else if (strikeText) {
            segments.push({
                text: strikeText,
                style: theme.style.strikethrough,
            });
        } else if (emphasisAsterisk || emphasisUnderscore) {
            segments.push({
                text: emphasisAsterisk || emphasisUnderscore,
                style: theme.style.emphasis,
            });
        } else if (fullMatch) {
            segments.push({ text: fullMatch });
        }

        lastIndex = matchIndex + fullMatch.length;
    }

    if (lastIndex < sanitizedValue.length) {
        segments.push({ text: sanitizedValue.slice(lastIndex) });
    }

    return segments;
}

function expandInlineSegments(segments: InlineSegment[]): InlineSegment[] {
    const expandedSegments: InlineSegment[] = [];

    for (const segment of segments) {
        for (const part of segment.text.split(/(\s+)/u)) {
            if (!part) {
                continue;
            }

            if (/^\s+$/u.test(part)) {
                expandedSegments.push({ text: ' ' });
                continue;
            }

            expandedSegments.push({ text: part, style: segment.style });
        }
    }

    return expandedSegments;
}

function applyInlineStyle(
    segment: InlineSegment,
    blockStyle?: TextStyle,
): string {
    const styledText = segment.style
        ? segment.style(segment.text)
        : segment.text;

    if (!blockStyle) {
        return styledText;
    }

    return blockStyle(styledText);
}

function chunkInlineSegmentByWidth(
    segment: InlineSegment,
    width: number,
): InlineSegment[] {
    const chunks: InlineSegment[] = [];
    let currentChunk = '';
    let currentWidth = 0;

    for (const grapheme of iterateGraphemes(segment.text)) {
        const graphemeWidth = visibleLength(grapheme);

        if (currentWidth > 0 && currentWidth + graphemeWidth > width) {
            chunks.push({ text: currentChunk, style: segment.style });
            currentChunk = '';
            currentWidth = 0;
        }

        currentChunk += grapheme;
        currentWidth += graphemeWidth;
    }

    if (currentChunk) {
        chunks.push({ text: currentChunk, style: segment.style });
    }

    return chunks;
}

function chunkWordByWidth(word: string, width: number): string[] {
    const chunks: string[] = [];
    let currentChunk = '';
    let currentWidth = 0;

    for (const segment of iterateGraphemes(word)) {
        const segmentWidth = visibleLength(segment);

        if (currentWidth > 0 && currentWidth + segmentWidth > width) {
            chunks.push(currentChunk);
            currentChunk = '';
            currentWidth = 0;
        }

        currentChunk += segment;
        currentWidth += segmentWidth;
    }

    if (currentChunk) {
        chunks.push(currentChunk);
    }

    return chunks;
}

function truncateText(value: string, width: number): string {
    if (visibleLength(value) <= width) {
        return value;
    }

    if (width <= 1) {
        return slicePlainTextByWidth(value, width);
    }

    return `${slicePlainTextByWidth(value, width - 1).trimEnd()}…`;
}

function truncateVisible(
    value: string,
    width: number,
    ellipsisStyle: (text: string) => string,
): string {
    if (visibleLength(value) <= width) {
        return value;
    }

    return `${sliceAnsi(value, 0, Math.max(0, width - 1))}${ellipsisStyle('…')}`;
}

function fitPanelLine(
    value: string,
    width: number,
    ellipsisStyle: (text: string) => string,
): string {
    return visibleLength(value) <= width
        ? value
        : truncateVisible(value, width, ellipsisStyle);
}

function padVisible(value: string, width: number): string {
    const padding = Math.max(0, width - visibleLength(value));

    return `${value}${' '.repeat(padding)}`;
}

function visibleLength(value: string): number {
    return stringWidth(stripVTControlCharacters(value));
}

function slicePlainTextByWidth(value: string, width: number): string {
    if (width <= 0) {
        return '';
    }

    let result = '';
    let currentWidth = 0;

    for (const segment of iterateGraphemes(value)) {
        const segmentWidth = visibleLength(segment);

        if (currentWidth + segmentWidth > width) {
            break;
        }

        result += segment;
        currentWidth += segmentWidth;
    }

    return result;
}

function iterateGraphemes(value: string): string[] {
    return Array.from(
        GRAPHEME_SEGMENTER.segment(value),
        ({ segment }) => segment,
    );
}

function shortNoteId(id: string): string {
    return id.slice(0, 8);
}
