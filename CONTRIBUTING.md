# Contributing to Drafty CLI

[한국어](CONTRIBUTING.ko.md)

## Prerequisites

- Node.js 20 or later
- npm
- A Supabase project
- Supabase CLI via `npx supabase`

## Setup

```bash
git clone https://github.com/hyeonjin-kim-dev/drafty-cli.git
cd drafty-cli
npm install
```

You can either copy `.env.example` to `.env` for repository-local development, or run `drafty login` to save the same values to your per-user config file.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_PROJECT_ID=your-project-ref
```

`SUPABASE_PROJECT_ID` is used by `npm run db:types`. If the repository is already linked with `npx supabase link`, the linked project ref is also accepted.

## Database

Drafty now uses a single-user notes table with anon-key access. Bootstrap or update a project from this repository:

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types
```

The checked-in migrations are the source of truth. The published npm package does not provision schema changes on its own.

## Development

Run the CLI directly from source:

```bash
npm run dev -- --help
npm run dev -- login
npm run dev -- work idea
```

Run the built CLI:

```bash
npm run build
npm run cli -- --help
```

Link globally for local testing:

```bash
npm run link:global
drafty login
```

Useful scripts:

```bash
npm run check          # typecheck + build
npm run dev:watch      # rebuild on change
npm run db:push        # apply checked-in migrations
npm run db:types       # regenerate database.types.ts
```

## Project structure

```
src/
  cli.ts             # Entrypoint, Commander registration, top-level error handling
  commands/          # One file per command
  lib/               # Core modules (config, supabase, errors, notes, editor, prompt, parse-tags, npm-update, package-meta)
  types/             # database.types.ts (generated from Supabase)
supabase/            # config.toml, migrations
```

## Conventions

- **ESM imports**: always use `.js` extensions
- **Filenames**: use `kebab-case`
- **Errors**: use `DraftyError` or `wrapSupabaseError()`, never bare `new Error()`
- **Supabase access**: prefer `createNotesClient()` and configuration helpers from `src/lib/config.ts`
- **Supabase results**: destructure `{ data, error }` and check `error` first
- **Generated types**: update `src/types/database.types.ts` via `npm run db:types`

## Publishing

```bash
npm login
npm run check
npm version patch   # or minor / major
npm publish
```

After publishing, users with a global npm install can update with:

```bash
drafty update
```

`drafty update` only works for global npm installs (`npm install -g drafty-cli`). It does not apply Supabase schema changes — users must run `npm run db:push` from the repository if migrations are included in the release.

```

The `prepack` script runs `npm run check` automatically before packaging.
```
