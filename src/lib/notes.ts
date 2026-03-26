import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.types.js';
import { openEditor } from './editor.js';
import { DraftyError, wrapSupabaseError } from './errors.js';
import { parseTags } from './parse-tags.js';

export interface NoteSummary {
    id: string;
    body: string;
    cli_tags: string[];
    status: string;
    created_at: string;
}

export interface NoteDetails extends NoteSummary {
    updated_at: string;
}

interface EditableNote {
    id: string;
    body: string;
    cli_tags: string[];
    status: string;
}

interface ListNotesOptions {
    includeArchived?: boolean;
    tags?: string[];
}

interface ArchiveNoteOptions {
    expectActive?: boolean;
}

const ESCAPED_MARKDOWN_SYMBOL_PATTERN = /\\(?=[\\`*_{}\[\]()#+\-.!>~|])/gu;
const HTML_ENTITY_PATTERN = /&(?:#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/giu;

interface BaseArchiveNoteResult {
    noteId: string;
}

interface MarkdownNormalizationTarget {
    id: string;
    body: string;
    status: string;
    updated_at: string;
}

export interface MarkdownNormalizationCandidate {
    id: string;
    body: string;
    status: string;
}

export interface MarkdownNormalizationPlan {
    scannedCount: number;
    candidateCount: number;
    candidates: MarkdownNormalizationCandidate[];
}

export interface MarkdownNormalizationResult {
    scannedCount: number;
    updatedCount: number;
    unchangedCount: number;
    skippedCount: number;
}

export interface ArchivedNoteResult extends BaseArchiveNoteResult {
    outcome: 'archived';
}

export interface AlreadyArchivedNoteResult extends BaseArchiveNoteResult {
    outcome: 'already-archived';
}

export interface NoteNotFoundResult extends BaseArchiveNoteResult {
    outcome: 'not-found';
}

export interface ChangedBeforeArchiveResult extends BaseArchiveNoteResult {
    outcome: 'changed';
}

export type ArchiveNoteResult =
    | ArchivedNoteResult
    | AlreadyArchivedNoteResult
    | NoteNotFoundResult
    | ChangedBeforeArchiveResult;

const ACTIVE_NOTE_STATUS = 'active';
const ARCHIVED_NOTE_STATUS = 'archived';

export type NoteEditTarget = 'body' | 'tags';

interface BaseNoteEditResult {
    target: NoteEditTarget;
    noteId: string;
    tags: string[];
}

export interface UpdatedNoteEditResult extends BaseNoteEditResult {
    outcome: 'updated';
}

export interface UnchangedNoteEditResult extends BaseNoteEditResult {
    outcome: 'unchanged';
}

export interface EmptyNoteEditResult {
    outcome: 'empty';
    target: 'body';
    noteId: string;
    tags: string[];
}

export type NoteEditResult =
    | UpdatedNoteEditResult
    | UnchangedNoteEditResult
    | EmptyNoteEditResult;

export async function listNotes(
    supabase: SupabaseClient<Database>,
    options: ListNotesOptions = {},
): Promise<NoteSummary[]> {
    let query = supabase
        .from('notes')
        .select('id, body, cli_tags, status, created_at');

    if (!options.includeArchived) {
        query = query.eq('status', ACTIVE_NOTE_STATUS);
    }

    if (options.tags && options.tags.length > 0) {
        query = query.overlaps('cli_tags', options.tags);
    }

    const { data, error } = await query.order('created_at', {
        ascending: false,
    });

    if (error) {
        throw wrapSupabaseError('Failed to load notes', error);
    }

    return data ?? [];
}

export async function getNoteById(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<NoteDetails | null> {
    const { data, error } = await supabase
        .from('notes')
        .select('id, body, cli_tags, status, created_at, updated_at')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw wrapSupabaseError('Failed to load the note', error);
    }

    return data;
}

export async function archiveNote(
    supabase: SupabaseClient<Database>,
    id: string,
    options: ArchiveNoteOptions = {},
): Promise<ArchiveNoteResult> {
    const { data, error } = await supabase
        .from('notes')
        .update({ status: ARCHIVED_NOTE_STATUS })
        .eq('id', id)
        .eq('status', ACTIVE_NOTE_STATUS)
        .select('id')
        .maybeSingle();

    if (error) {
        throw wrapSupabaseError('Failed to remove the note', error);
    }

    if (data) {
        return {
            outcome: 'archived',
            noteId: data.id,
        };
    }

    const currentNote = await getNoteById(supabase, id);

    if (!currentNote) {
        return {
            outcome: options.expectActive ? 'changed' : 'not-found',
            noteId: id,
        };
    }

    if (currentNote.status === ARCHIVED_NOTE_STATUS) {
        return {
            outcome: options.expectActive ? 'changed' : 'already-archived',
            noteId: id,
        };
    }

    return {
        outcome: 'changed',
        noteId: id,
    };
}

export async function archiveNotes(
    supabase: SupabaseClient<Database>,
    ids: string[],
    options: ArchiveNoteOptions = {},
): Promise<ArchiveNoteResult[]> {
    return Promise.all(
        ids.map(async (id) => archiveNote(supabase, id, options)),
    );
}

export async function editNoteBody(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<NoteEditResult> {
    const note = await loadEditableNote(supabase, id);
    const draftedBody = await openEditor(note.body);
    const nextBody = normalizeNoteBody(draftedBody);

    if (!nextBody.trim()) {
        return {
            outcome: 'empty',
            target: 'body',
            noteId: note.id,
            tags: note.cli_tags,
        };
    }

    if (nextBody === note.body) {
        return {
            outcome: 'unchanged',
            target: 'body',
            noteId: note.id,
            tags: note.cli_tags,
        };
    }

    const { data, error } = await supabase
        .from('notes')
        .update({ body: nextBody })
        .eq('id', note.id)
        .select('id, cli_tags')
        .single();

    if (error) {
        throw wrapSupabaseError('Failed to update the note', error);
    }

    return {
        outcome: 'updated',
        target: 'body',
        noteId: data.id,
        tags: data.cli_tags,
    };
}

export async function editNoteTags(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<NoteEditResult> {
    const note = await loadEditableNote(supabase, id);
    const draftedTags = await openEditor(serializeEditableTags(note.cli_tags));
    const nextTags = normalizeEditableTags(draftedTags);

    if (areTagsEqual(nextTags, note.cli_tags)) {
        return {
            outcome: 'unchanged',
            target: 'tags',
            noteId: note.id,
            tags: note.cli_tags,
        };
    }

    const { data, error } = await supabase
        .from('notes')
        .update({ cli_tags: nextTags })
        .eq('id', note.id)
        .select('id, cli_tags')
        .single();

    if (error) {
        throw wrapSupabaseError('Failed to update the note tags', error);
    }

    return {
        outcome: 'updated',
        target: 'tags',
        noteId: data.id,
        tags: data.cli_tags,
    };
}

export async function planMarkdownNormalization(
    supabase: SupabaseClient<Database>,
): Promise<MarkdownNormalizationPlan> {
    const { scannedCount, candidates } =
        await collectMarkdownNormalizationTargets(supabase);

    return {
        scannedCount,
        candidateCount: candidates.length,
        candidates: candidates.map(({ id, body, status }) => ({
            id,
            body,
            status,
        })),
    };
}

export async function normalizeStoredMarkdownBodies(
    supabase: SupabaseClient<Database>,
): Promise<MarkdownNormalizationResult> {
    const { scannedCount, candidates } =
        await collectMarkdownNormalizationTargets(supabase);
    let updatedCount = 0;
    let skippedCount = 0;

    for (const candidate of candidates) {
        const nextBody = normalizeMarkdownForDisplay(candidate.body);
        const { data, error } = await supabase
            .from('notes')
            .update({ body: nextBody })
            .eq('id', candidate.id)
            .eq('updated_at', candidate.updated_at)
            .select('id')
            .maybeSingle();

        if (error) {
            throw wrapSupabaseError(
                'Failed to normalize stored note markdown',
                error,
            );
        }

        if (data) {
            updatedCount += 1;
            continue;
        }

        skippedCount += 1;
    }

    return {
        scannedCount,
        updatedCount,
        unchangedCount: scannedCount - candidates.length,
        skippedCount,
    };
}

export function formatNoteEditMessages(result: NoteEditResult): string[] {
    if (result.outcome === 'updated') {
        if (result.target === 'tags') {
            return [
                `Updated tags for note: ${result.noteId}`,
                `Tags: ${formatTags(result.tags)}`,
            ];
        }

        return [
            `Updated note: ${result.noteId}`,
            `Tags: ${formatTags(result.tags)}`,
        ];
    }

    if (result.outcome === 'unchanged') {
        if (result.target === 'tags') {
            return ['No tag changes. Existing tags were kept.'];
        }

        return ['No changes. Existing note was kept.'];
    }

    return ['Empty note. Existing note was kept.'];
}

export function formatTags(tags: string[]): string {
    return tags.length > 0 ? tags.join(', ') : '(none)';
}

export function filterNotesByBodyQuery<T extends Pick<NoteSummary, 'body'>>(
    notes: T[],
    query: string,
): T[] {
    const normalizedQuery = normalizeNoteBodyQuery(query);

    if (!normalizedQuery) {
        return notes;
    }

    return notes.filter((note) =>
        normalizeSearchableNoteBody(note.body).includes(normalizedQuery),
    );
}

export function normalizeNoteBody(value: string): string {
    return value;
}

export function normalizeMarkdownForDisplay(value: string): string {
    return normalizeMarkdownEscapes(decodeHtmlEntities(value));
}

export function normalizeMarkdownEscapes(value: string): string {
    return value.replace(ESCAPED_MARKDOWN_SYMBOL_PATTERN, '');
}

export function decodeHtmlEntities(value: string): string {
    return value.replace(HTML_ENTITY_PATTERN, (entity) =>
        decodeHtmlEntity(entity),
    );
}

export function normalizeEditableTags(value: string): string[] {
    const normalizedValue = value.trim();

    if (!normalizedValue) {
        return [];
    }

    return parseTags(normalizedValue.split(/\s+/u));
}

export function formatTimestamp(value: string): string {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(date);
}

export function summarizeNoteBody(body: string, maxLength = 72): string {
    const normalizedBody = body.replace(/\s+/gu, ' ').trim();

    if (!normalizedBody) {
        return '(empty)';
    }

    if (normalizedBody.length <= maxLength) {
        return normalizedBody;
    }

    return `${normalizedBody.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeNoteBodyQuery(value: string): string {
    return value.replace(/\s+/gu, ' ').trim().toLocaleLowerCase();
}

function normalizeSearchableNoteBody(value: string): string {
    return normalizeMarkdownForDisplay(value)
        .replace(/\s+/gu, ' ')
        .trim()
        .toLocaleLowerCase();
}

function areTagsEqual(left: string[], right: string[]): boolean {
    return (
        left.length === right.length &&
        left.every((tag, index) => tag === right[index])
    );
}

function serializeEditableTags(tags: string[]): string {
    return tags.join(' ');
}

async function collectMarkdownNormalizationTargets(
    supabase: SupabaseClient<Database>,
): Promise<{
    scannedCount: number;
    candidates: MarkdownNormalizationTarget[];
}> {
    const notes = await listMarkdownNormalizationTargets(supabase);
    const candidates = notes.filter(
        (note) => normalizeMarkdownForDisplay(note.body) !== note.body,
    );

    return {
        scannedCount: notes.length,
        candidates,
    };
}

async function listMarkdownNormalizationTargets(
    supabase: SupabaseClient<Database>,
): Promise<MarkdownNormalizationTarget[]> {
    const pageSize = 200;
    const notes: MarkdownNormalizationTarget[] = [];
    let fromIndex = 0;

    while (true) {
        const { data, error } = await supabase
            .from('notes')
            .select('id, body, status, updated_at')
            .order('created_at', { ascending: false })
            .range(fromIndex, fromIndex + pageSize - 1);

        if (error) {
            throw wrapSupabaseError(
                'Failed to load notes for markdown normalization',
                error,
            );
        }

        const page = data ?? [];

        if (page.length === 0) {
            break;
        }

        notes.push(...page);

        if (page.length < pageSize) {
            break;
        }

        fromIndex += pageSize;
    }

    return notes;
}

function decodeHtmlEntity(entity: string): string {
    const normalizedEntity = entity.toLowerCase();

    if (normalizedEntity.startsWith('&#x')) {
        const codePoint = Number.parseInt(normalizedEntity.slice(3, -1), 16);

        return Number.isNaN(codePoint)
            ? entity
            : String.fromCodePoint(codePoint);
    }

    if (normalizedEntity.startsWith('&#')) {
        const codePoint = Number.parseInt(normalizedEntity.slice(2, -1), 10);

        return Number.isNaN(codePoint)
            ? entity
            : String.fromCodePoint(codePoint);
    }

    switch (normalizedEntity) {
        case '&amp;':
            return '&';
        case '&lt;':
            return '<';
        case '&gt;':
            return '>';
        case '&quot;':
            return '"';
        case '&apos;':
            return "'";
        case '&nbsp;':
            return ' ';
        default:
            return entity;
    }
}

async function loadEditableNote(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<EditableNote> {
    const { data, error } = await supabase
        .from('notes')
        .select('id, body, cli_tags, status')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw wrapSupabaseError('Failed to load the note', error);
    }

    if (!data) {
        throw new DraftyError('Note not found.');
    }

    if (data.status === ARCHIVED_NOTE_STATUS) {
        throw new DraftyError('Removed notes cannot be edited.');
    }

    return data;
}
