import type { SupabaseClient } from '@supabase/supabase-js';

import { canOpenEditorInBackground } from '../lib/editor.js';
import { formatError } from '../lib/errors.js';
import {
    archiveNote,
    filterNotesByBodyQuery,
    formatNoteEditMessages,
    formatTags,
    formatTimestamp,
    listNotes,
    startNoteBodyEditSession,
    startNoteTagsEditSession,
    type NoteEditSession,
    type NoteEditTarget,
    summarizeNoteBody,
    type NoteSummary,
} from '../lib/notes.js';
import { parseTags } from '../lib/parse-tags.js';
import { createNotesClient } from '../lib/supabase.js';
import type { Database } from '../types/database.types.js';
import { promptForNoteSelection } from './interactive-list.js';
import {
    promptForNoteEdit,
    promptForNoteEditTarget,
} from './interactive-edit.js';
import { promptForNoteRemovalConfirmation } from './interactive-remove.js';

interface ListCommandOptions {
    initialSearchQuery?: string;
    emptyMessage?: string;
}

interface TrackedNoteEditSession {
    handled: Promise<void>;
    noteId: string;
    target: NoteEditTarget;
}

export async function listNotesCommand(
    rawTags: string[] = [],
    options: ListCommandOptions = {},
): Promise<void> {
    const supabase = createNotesClient();
    const tags = parseTags(rawTags);
    const initialSearchQuery = options.initialSearchQuery?.trim() ?? '';

    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        const data = filterNotesByBodyQuery(
            await listNotes(supabase, { tags }),
            initialSearchQuery,
        );

        if (data.length === 0) {
            console.log(
                options.emptyMessage ??
                    buildEmptyNotesMessage(initialSearchQuery),
            );
            return;
        }

        printPlainNoteList(data);
        return;
    }

    await runInteractiveListLoop(supabase, tags, initialSearchQuery);
}

function printPlainNoteList(notes: NoteSummary[]): void {
    for (const note of notes) {
        console.log(formatTags(note.cli_tags));
        console.log(summarizeNoteBody(note.body));
        console.log(`Updated: ${formatTimestamp(note.updated_at)}`);
        console.log('');
    }
}

async function runInteractiveListLoop(
    supabase: SupabaseClient<Database>,
    tags: string[],
    initialSearchQuery = '',
): Promise<void> {
    let activeFilterTag: string | null = null;
    let activeSearchQuery = initialSearchQuery;
    const pendingEditSessions = new Map<string, TrackedNoteEditSession>();
    const queuedEditMessages: string[][] = [];

    while (true) {
        flushQueuedEditMessages(queuedEditMessages);

        const notes = await listNotes(supabase, { tags });

        if (notes.length === 0) {
            await waitForPendingEditSessions(
                pendingEditSessions,
                queuedEditMessages,
            );
            flushQueuedEditMessages(queuedEditMessages);
            console.log('No notes found.');
            return;
        }

        const selection = await promptForNoteSelection(
            notes,
            activeFilterTag,
            activeSearchQuery,
        );

        if (!selection) {
            await waitForPendingEditSessions(
                pendingEditSessions,
                queuedEditMessages,
            );
            flushQueuedEditMessages(queuedEditMessages);
            console.log('Canceled.');
            return;
        }

        activeFilterTag = selection.filterTag;
        activeSearchQuery = selection.searchQuery;

        if (selection.action === 'remove') {
            const selectedNote = notes.find(
                (note) => note.id === selection.noteId,
            );

            if (!selectedNote) {
                console.log('Selected note is no longer available.');
                continue;
            }

            const removed = await removeNoteFromList(supabase, selectedNote);

            if (removed) {
                continue;
            }

            continue;
        }

        if (!canOpenEditorInBackground()) {
            const result = await promptForNoteEdit(supabase, selection.noteId);

            if (!result) {
                continue;
            }

            for (const line of formatNoteEditMessages(result)) {
                console.log(line);
            }

            continue;
        }

        const target = await promptForNoteEditTarget();

        if (!target) {
            continue;
        }

        const sessionKey = getTrackedSessionKey(selection.noteId, target);

        if (pendingEditSessions.has(sessionKey)) {
            console.log(
                `That note's ${target} is already open in another editor window.`,
            );
            continue;
        }

        const session = await startTrackedNoteEditSession(
            supabase,
            selection.noteId,
            target,
        );
        const trackedSession = trackNoteEditSession(
            session,
            pendingEditSessions,
            queuedEditMessages,
        );

        pendingEditSessions.set(sessionKey, trackedSession);
        console.log(
            `Opened ${target} editor for note: ${selection.noteId}. Keep browsing while it stays open.`,
        );
    }
}

async function removeNoteFromList(
    supabase: SupabaseClient<Database>,
    note: NoteSummary,
): Promise<boolean> {
    printSingleRemovalPreview(note);

    const confirmed = await promptForNoteRemovalConfirmation([note]);

    if (!confirmed) {
        console.log('Canceled.');
        return false;
    }

    const result = await archiveNote(supabase, note.id, { expectActive: true });

    if (result.outcome === 'archived') {
        console.log(`Removed note: ${result.noteId}`);
        return true;
    }

    console.log('Skipped note because it changed before removal.');
    return false;
}

function printSingleRemovalPreview(note: NoteSummary): void {
    console.log('Selected 1 note:');
    console.log(`- ${summarizeNoteBody(note.body, 56)}`);
    console.log(
        `  ${formatTimestamp(note.created_at)}  Tags: ${formatTags(note.cli_tags)}`,
    );
    console.log('');
}

function buildEmptyNotesMessage(searchQuery: string): string {
    return searchQuery
        ? `No notes matched the search query: ${searchQuery}`
        : 'No notes found.';
}

async function startTrackedNoteEditSession(
    supabase: SupabaseClient<Database>,
    noteId: string,
    target: NoteEditTarget,
): Promise<NoteEditSession> {
    if (target === 'tags') {
        return startNoteTagsEditSession(supabase, noteId);
    }

    return startNoteBodyEditSession(supabase, noteId);
}

function trackNoteEditSession(
    session: NoteEditSession,
    pendingEditSessions: Map<string, TrackedNoteEditSession>,
    queuedEditMessages: string[][],
): TrackedNoteEditSession {
    const sessionKey = getTrackedSessionKey(session.noteId, session.target);

    return {
        noteId: session.noteId,
        target: session.target,
        handled: session.completion
            .then((result) => {
                queuedEditMessages.push(formatNoteEditMessages(result));
            })
            .catch((error) => {
                queuedEditMessages.push([
                    `Failed to update ${session.target} for note: ${session.noteId}`,
                    formatError(error),
                ]);
            })
            .finally(() => {
                pendingEditSessions.delete(sessionKey);
            }),
    };
}

async function waitForPendingEditSessions(
    pendingEditSessions: Map<string, TrackedNoteEditSession>,
    queuedEditMessages: string[][],
): Promise<void> {
    if (pendingEditSessions.size === 0) {
        return;
    }

    console.log(
        `Waiting for ${pendingEditSessions.size} open editor session(s) to finish syncing...`,
    );
    await Promise.allSettled(
        Array.from(pendingEditSessions.values(), (session) => session.handled),
    );
    flushQueuedEditMessages(queuedEditMessages);
}

function flushQueuedEditMessages(queuedEditMessages: string[][]): void {
    while (queuedEditMessages.length > 0) {
        const lines = queuedEditMessages.shift();

        if (!lines) {
            continue;
        }

        for (const line of lines) {
            console.log(line);
        }
    }
}

function getTrackedSessionKey(noteId: string, target: NoteEditTarget): string {
    return `${noteId}:${target}`;
}
