# Drafty CLI

[한국어](README.ko.md)

> Capture notes from your terminal and sync them to your own Supabase project.

[![npm version](https://img.shields.io/npm/v/drafty-cli)](https://www.npmjs.com/package/drafty-cli)
[![license](https://img.shields.io/npm/l/drafty-cli)](LICENSE)
[![node](https://img.shields.io/node/v/drafty-cli)](package.json)

## Features

- **Setup wizard** — `drafty login` saves your Supabase URL, anon key, and project id to a per-user config file
- **System editor flow** — opens `$VISUAL`, `$EDITOR`, VS Code, Notepad, or vim
- **Tag-first capture** — attach tags as positional arguments such as `drafty work idea`
- **Interactive TTY menus** — arrow-key picker for listing, previewing, tag filtering, body searching, editing, and removing notes
- **Markdown sync** — mirror every markdown file under the current directory as read-only notes
- **Soft delete** — archived notes stay visible through `drafty show <id>`
- **Cross-platform** — Windows, macOS, Linux

## Install

```bash
npm install -g drafty-cli
```

Requires Node.js 20+.

## Quick start

```bash
drafty login          # save SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_PROJECT_ID
drafty work idea      # open editor -> save note with tags
drafty list           # browse notes interactively in a TTY
drafty list todo idea # show active notes tagged todo OR idea
drafty search meeting notes # search note bodies for a phrase
drafty sync           # sync all markdown files under the current directory
drafty show <id>      # inspect a note, including archived notes
drafty rm <id>        # archive a note
drafty normalize-markdown --dry-run # preview stored markdown cleanup
drafty update         # update to the latest version
```

## Configuration

Drafty needs three Supabase values:

| Variable              | Description                                                                      |
| --------------------- | -------------------------------------------------------------------------------- |
| `SUPABASE_URL`        | Your Supabase project URL                                                        |
| `SUPABASE_ANON_KEY`   | Your Supabase anon key                                                           |
| `SUPABASE_PROJECT_ID` | Your Supabase project ref, used by repository tooling such as `npm run db:types` |

Run `drafty login` to save these values into the per-user config file that Drafty already reads.

Drafty resolves configuration in this order:

1. Shell environment variables
2. `.env` in the current working directory
3. Per-user config file written by `drafty login`

Per-user config paths:

- Windows: `%APPDATA%\Drafty\.env`
- macOS / Linux: `~/.config/drafty/.env`

`drafty logout` removes the saved per-user config and also cleans up any legacy `session.json` file left behind by older releases.

## Commands

| Command                     | Description                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `drafty [tags...]`          | Open an editor and save a new note with optional tags                                                                                                                                                                                                   |
| `drafty login`              | Run the setup wizard and save local Supabase config                                                                                                                                                                                                     |
| `drafty logout`             | Remove the saved local config and any legacy session file                                                                                                                                                                                               |
| `drafty list [tags...]`     | List active notes, optionally filtered by tags with OR semantics; interactive TTY view includes a preview pane, colored tags, top tag filtering with `Tab` or arrow keys, body search with `s` or `/`, and direct remove shortcuts with `d` or `Delete` |
| `drafty search <query...>`  | Search active note bodies for a phrase; in a TTY, browse, refine, edit, and remove matching notes interactively                                                                                                                                         |
| `drafty sync`               | Sync every markdown file under the current directory into Drafty as read-only notes; use `--env <label>` to override the environment label and `--dry-run` to preview changes                                                                   |
| `drafty show <id>`          | Show a single note, including archived notes                                                                                                                                                                                                            |
| `drafty edit <id>`          | Edit a note body or its tags                                                                                                                                                                                                                            |
| `drafty rm [id]`            | Archive one note by id, or multi-select notes in a TTY                                                                                                                                                                                                  |
| `drafty normalize-markdown` | Repair stored markdown by removing escaped markdown symbols such as `\_`, `\[`, `\*`, `1\.` and decoding stored HTML entities such as `&#x20;`; use `--dry-run` to preview and `--yes` to skip confirmation                                             |
| `drafty update`             | Check for a newer npm version and update; use `--check` to preview without installing                                                                                                                                                                   |

## Editor

Drafty uses the first available editor:

1. `$VISUAL`
2. `$EDITOR`
3. `notepad` on Windows or `vim` on macOS and Linux

Example override:

```bash
export EDITOR="code --wait"
```

Windows PowerShell:

```powershell
$env:EDITOR = "code --wait"
```

If you are using bash on Windows, set it for the current session with:

```bash
export EDITOR="code --wait"
```

Persist it for future terminals on Windows:

```powershell
setx EDITOR "code --wait"
```

`setx` does not update the current PowerShell, bash, or already-open VS Code terminal session. Open a new terminal or restart VS Code before expecting it to take effect.

If `code` is not available on your `PATH`, either enable the VS Code shell command during installation, or point `EDITOR` to the full `Code.exe` path with `--wait`.

## Supabase setup

Drafty now assumes a single-user project model. The npm package does not create the database schema for you. Bootstrap a new Supabase project from this repository:

```bash
git clone https://github.com/hyeonjin-kim-dev/drafty-cli.git
cd drafty-cli
npm install
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types
```

The current schema uses a single `notes` table with anon-key access and an active or archived lifecycle.

## Markdown Sync

`drafty sync` recursively scans the current directory and mirrors every markdown file it finds into Drafty as read-only notes.

- Source of truth stays in the local markdown file.
- Synced docs can be opened from other machines through `drafty list` and `drafty show`.
- Editing a synced markdown note inside Drafty is blocked; change the source markdown file locally, then run `drafty sync` again.
- If a synced markdown file disappears from the current directory tree, the next sync archives the corresponding Drafty note.
- List and show surfaces include the environment label and source path for synced docs.

## Troubleshooting

**`Drafty is not configured` appears?**

Run `drafty login`, or provide `SUPABASE_URL` and `SUPABASE_ANON_KEY` through your shell or local `.env`.

**`missing the latest Drafty schema` appears?**

Your Supabase project still has the old authenticated schema or is missing the checked-in migrations. Run `npm run db:push` from this repository and try again.

**`Supabase rejected these credentials` appears?**

Re-run `drafty login` and verify the saved URL and anon key.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, project structure, and conventions.

## License

[MIT](LICENSE)
