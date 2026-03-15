# Drafty CLI

Drafty is a cross-platform CLI note app built with TypeScript, Commander, and Supabase.

The MVP flow is:

1. Sign in with an emailed 6-digit code.
2. Open a system editor for note entry.
3. Save the note to Supabase with the current user id and normalized tags.
4. List or show notes that belong to the logged-in user.

Drafty does not support a browser redirect login flow. The login email must contain a code that you paste back into the terminal.

## Requirements

- Node.js 20 or later
- npm
- A Supabase project with Auth enabled

## Environment

Copy .env.example to .env and set the values below.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_PROJECT_ID=your-project-id
```

SUPABASE_PROJECT_ID is used by `npm run db:types`. If you already ran `npx supabase link`, Drafty can also reuse the linked project ref.

## Install

```bash
npm install
npm run build
```

## Local development

For day-to-day development, you do not need `npm link`.

Run the CLI directly from source:

```bash
npm run dev -- --help
npm run dev -- login
npm run dev -- whoami
npm run dev -- work idea
```

Run the built CLI:

```bash
npm run build
npm run cli -- --help
npm run cli -- login
```

If you want the global `drafty` command in your shell, link it explicitly:

```bash
npm run link:global
drafty login
```

Useful scripts:

```bash
npm run check
npm run dev:watch -- --help
```

## Supabase Auth setup

Drafty uses `supabase.auth.signInWithOtp()` plus `verifyOtp({ type: 'email' })`, so the hosted Auth project must send a token-based email instead of a browser-first magic link.

The repository now includes a checked-in Auth config and email templates:

- [supabase/config.toml](supabase/config.toml)
- [supabase/templates/confirmation.html](supabase/templates/confirmation.html)
- [supabase/templates/magic_link.html](supabase/templates/magic_link.html)

Apply the Auth configuration to the linked Supabase project:

```bash
npx supabase config push
```

The intended hosted Auth behavior is:

1. `auth.site_url` points to a neutral landing page instead of localhost.
2. `auth.email.enable_confirmations` stays enabled for new-user confirmation.
3. `magic_link` and `confirmation` templates render `{{ .Token }}` and explicitly tell users to paste the code into Drafty.
4. Browser-only `{{ .ConfirmationURL }}` buttons are removed from login emails.

## Commands

```bash
npm run dev -- login
npm run dev -- logout
npm run dev -- whoami
npm run dev -- list
npm run dev -- show <id>
npm run dev -- work idea
```

Tags are passed as positional arguments. Drafty also strips a leading # if you accidentally use the older syntax.

## Editor selection

Drafty opens the first available editor from the list below.

1. VISUAL
2. EDITOR
3. notepad on Windows
4. vim on macOS and Linux

No extra setup is required for the default case. On Windows, Drafty falls back to the system Notepad automatically.

If you want a custom editor, set VISUAL or EDITOR to the full command. Examples:

```bash
set EDITOR=C:\Program Files\Notepad++\notepad++.exe
set EDITOR=code --wait
```

## Session storage

- Windows: %APPDATA%/Drafty/session.json
- macOS/Linux: XDG_CONFIG_HOME/drafty/session.json or ~/.config/drafty/session.json

## Login troubleshooting

If `drafty login` sends an email with a button or redirect link instead of a 6-digit code, the Supabase Auth templates are still configured for browser login.

Use this checklist:

1. Run `npx supabase config push` from this repository.
2. In Supabase Dashboard, confirm `Authentication > URL Configuration > SITE_URL` is not a localhost placeholder.
3. In `Authentication > Email Templates`, confirm both `Magic Link` and `Confirm sign up` emails show `{{ .Token }}` content rather than a `{{ .ConfirmationURL }}` link.
4. Test both a new email address and an existing confirmed account with `npm run dev -- login`.

If the email still arrives as a link-only message, inspect the hosted template that was sent and compare it with [supabase/templates/confirmation.html](supabase/templates/confirmation.html) and [supabase/templates/magic_link.html](supabase/templates/magic_link.html).

## Database setup

The initial notes table and RLS policies live in [supabase/migrations/20260315000000_create_notes.sql](supabase/migrations/20260315000000_create_notes.sql).

Link the local repository to your Supabase project once:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
```

Apply the migration with the Supabase CLI:

```bash
npm run db:push
```

Generate fresh TypeScript database types when your schema changes:

```bash
npm run db:types
```

Recommended first-run flow:

```bash
npm install
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types
npx supabase config push
npm run dev -- login
```
