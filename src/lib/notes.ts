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
}

interface ArchiveNoteOptions {
    expectActive?: boolean;
}

interface BaseArchiveNoteResult {
    noteId: string;
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
        .select('id, body, cli_tags, status, created_at')
        .order('created_at', { ascending: false });

    if (!options.includeArchived) {
        query = query.eq('status', ACTIVE_NOTE_STATUS);
    }

    const { data, error } = await query;

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

export function normalizeNoteBody(value: string): string {
    return value.replace(/\s+$/u, '');
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

function areTagsEqual(left: string[], right: string[]): boolean {
    return (
        left.length === right.length &&
        left.every((tag, index) => tag === right[index])
    );
}

function serializeEditableTags(tags: string[]): string {
    return tags.join(' ');
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