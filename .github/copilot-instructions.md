# Drafty CLI — Project Guidelines

터미널에서 메모를 캡처하고 Supabase에 저장하는 개인 CLI 앱.
`drafty [태그...]` → 시스템 에디터 → Supabase 저장. 설정은 `drafty login`이 per-user `.env`에 저장한다.

## Tech Stack

- **Runtime**: Node.js ≥20, ESM (`"type": "module"`)
- **Language**: TypeScript 5.9, `strict: true`, `noUncheckedIndexedAccess: true`
- **CLI**: Commander v14
- **Backend**: Supabase Postgres via anon-key access (single-user project model)
- **Dev**: tsx (dev 실행), tsc (빌드)

## Build & Test

```bash
npm run check        # typecheck + build (PR 전 필수 실행)
npm run dev -- <cmd> # tsx로 바로 실행 (개발용)
npm run build        # tsc → dist/
npm run typecheck    # tsc --noEmit
npm run db:types     # Supabase 스키마 → database.types.ts 재생성
```

## Architecture

```
src/
  cli.ts             # 진입점, Commander 명령어 등록, 전역 에러 catch
  commands/          # 각 명령어 파일 (capture, login, list, show, edit, logout, remove)
  lib/               # 핵심 모듈 (config, supabase, errors, notes, editor, prompt, parse-tags)
  types/             # database.types.ts (자동 생성 — 직접 수정 금지)
supabase/            # config.toml, migrations
```

- 명령어 → `src/commands/`에 파일 추가 후 `cli.ts`에 등록
- 공통 로직 → `src/lib/`에 모듈로 분리
- `database.types.ts`는 `npm run db:types`로만 갱신
- 로컬 설정은 기존 per-user `.env` 경로를 사용하고, 새 포맷을 추가하지 않음

## Conventions

- **import 경로**: 반드시 `.js` 확장자 명시 (ESM 필수)
- **파일명**: `kebab-case` (예: `parse-tags.ts`)
- **에러**: `DraftyError` 또는 `wrapSupabaseError()` 사용, `new Error()` 금지
- **Supabase 접근**: `createNotesClient()`와 `src/lib/config.ts` 헬퍼 사용
- **Supabase 결과**: 항상 `{ data, error }` 구조 분해 후 error 먼저 확인
