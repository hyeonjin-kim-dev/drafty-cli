import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../types/database.types.js';
import { openEditor } from './editor.js';
import { DraftyError, wrapSupabaseError } from './errors.js';

export interface NoteSummary {
    id: string;
    body: string;
    cli_tags: string[];
    status: string;
    created_at: string;
}

interface EditableNote {
    id: string;
    body: string;
    cli_tags: string[];
}

export interface UpdatedNoteEditResult {
    outcome: 'updated';
    noteId: string;
    tags: string[];
}

export interface UnchangedNoteEditResult {
    outcome: 'unchanged';
    noteId: string;
    tags: string[];
}

export interface EmptyNoteEditResult {
    outcome: 'empty';
    noteId: string;
    tags: string[];
}

export type NoteEditResult =
    | UpdatedNoteEditResult
    | UnchangedNoteEditResult
    | EmptyNoteEditResult;

export async function listNotes(
    supabase: SupabaseClient<Database>,
): Promise<NoteSummary[]> {
    const { data, error } = await supabase
        .from('notes')
        .select('id, body, cli_tags, status, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        throw wrapSupabaseError('Failed to load notes', error);
    }

    return data ?? [];
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
            noteId: note.id,
            tags: note.cli_tags,
        };
    }

    if (nextBody === note.body) {
        return {
            outcome: 'unchanged',
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
        noteId: data.id,
        tags: data.cli_tags,
    };
}

export function formatNoteEditMessages(result: NoteEditResult): string[] {
    if (result.outcome === 'updated') {
        return [
            `Updated note: ${result.noteId}`,
            `Tags: ${formatTags(result.tags)}`,
        ];
    }

    if (result.outcome === 'unchanged') {
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

async function loadEditableNote(
    supabase: SupabaseClient<Database>,
    id: string,
): Promise<EditableNote> {
    const { data, error } = await supabase
        .from('notes')
        .select('id, body, cli_tags')
        .eq('id', id)
        .maybeSingle();

    if (error) {
        throw wrapSupabaseError('Failed to load the note', error);
    }

    if (!data) {
        throw new DraftyError('Note not found.');
    }

    return data;
}