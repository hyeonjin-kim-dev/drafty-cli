---
description: "Drafty CLI 프로젝트에서 새 명령어 추가, lib 모듈 작성, Supabase 연동, 에러 처리, 세션/인증 로직 구현 시 적용. TypeScript 코딩 컨벤션, 명령어 패턴, 에러 계층, 인증 흐름을 준수해야 할 때 사용."
applyTo: "src/**/*.ts"
---

# Drafty CLI 코딩 컨벤션

## 프로젝트 개요

터미널 중심의 개인 메모 CLI 앱. 사용자가 `drafty [태그...]`를 실행하면 시스템 에디터가 열리고 메모가 Supabase에 저장된다. 인증은 이메일 OTP 방식을 사용한다.

## 명령어 구현 패턴 (commands/)

- 함수명은 반드시 `<동작>Command()` 형태로 작성한다.
- 반환 타입은 항상 `Promise<void>`이다.
- 에러는 함수 내부에서 `throw`하고, `cli.ts`의 최상위에서 catch하여 `formatError()`로 출력한다.
- 인증이 필요한 명령어는 반드시 첫 줄에 `requireAuthenticatedSession()`을 호출한다.

```typescript
// ✅ 올바른 명령어 구조
export async function <동작>Command(arg: string): Promise<void> {
    const session = await requireAuthenticatedSession();  // 인증 필요 시 첫 줄
    const supabase = createNotesClient(session);          // 인증된 클라이언트 생성
    const { data, error } = await supabase.from('notes')...;
    if (error) throw wrapSupabaseError('<컨텍스트>', error);
    // 출력
}
```

## 인증 및 세션 패턴 (lib/auth.ts, lib/session-store.ts)

- 인증이 필요한 모든 작업에서 `requireAuthenticatedSession()`을 사용한다. 세션을 직접 읽거나 만료 로직을 직접 구현하지 않는다.
- Supabase 호출에는 반드시 `createNotesClient(session)`으로 생성한 인증된 클라이언트를 사용한다 (기본 클라이언트 `createBaseClient()`는 로그인 흐름에서만 사용).
- 세션 파일 쓰기는 `writeSession()`을 사용한다. 직접 `fs.writeFile`을 호출하지 않는다 (원자적 쓰기 보장).

```typescript
// ✅ 인증 필요 명령어
const session = await requireAuthenticatedSession();
const supabase = createNotesClient(session);

// ✅ 로그인 흐름 (login 명령어에서만)
const supabase = createBaseClient();
await supabase.auth.signInWithOtp({ email });
```

## 에러 처리 패턴 (lib/errors.ts)

- 사용자에게 보여줄 에러는 항상 `DraftyError`를 throw한다.
- Supabase에서 반환된 에러는 반드시 `wrapSupabaseError(context, error)`로 감싸서 throw한다. `Error` 클래스를 직접 사용하지 않는다.
- `formatError()`는 `cli.ts`의 최상위 catch에서만 사용한다. 명령어 내부에서 호출하지 않는다.

```typescript
// ✅ Supabase 에러 처리
const { data, error } = await supabase.from('notes').select('*');
if (error) throw wrapSupabaseError('메모 목록 조회', error);

// ✅ 사용자 친화적 에러
if (!body.trim()) {
    throw new DraftyError('메모 내용이 비어 있습니다.');
}

// ❌ 직접 Error 사용 금지
throw new Error('something went wrong');
```

## Supabase 클라이언트 사용 (lib/supabase.ts)

- `createClient()`를 직접 호출하지 않는다. 반드시 `createBaseClient()` 또는 `createNotesClient(session)`을 사용한다.
- 클라이언트는 `SupabaseClient<Database>` 타입으로 `database.types.ts`의 자동 생성 타입을 활용한다.
- Supabase 결과는 항상 `{ data, error }` 구조 분해로 받고, `error`를 먼저 확인한다.

```typescript
// ✅ 올바른 Supabase 쿼리 패턴
const { data, error } = await supabase
    .from('notes')
    .select('id, body, cli_tags, created_at')
    .order('created_at', { ascending: false });
if (error) throw wrapSupabaseError('메모 조회', error);
```

## TypeScript 타입 컨벤션

- 데이터 구조 정의는 `interface`를 사용한다 (예: `StoredSession`, `DraftyPaths`).
- 복잡한 조건부 타입이나 유틸리티 타입 조합은 `type`을 사용한다.
- `tsconfig.json`의 `strict: true`, `noUncheckedIndexedAccess: true`를 항상 준수한다.
- 타입 단언(`as`)은 런타임 타입 검증 이후에만 사용한다.

```typescript
// ✅ 인터페이스 사용 - 데이터 구조
export interface NewNoteOptions {
    tags: string[];
    status: 'draft' | 'published';
}

// ✅ 타입 단언 - 검증 후에만 허용
if (typeof parsed.accessToken !== 'string') {
    throw new DraftyError('세션 파일이 손상되었습니다.');
}
return parsed as StoredSession;
```

## 태그 처리 (lib/parse-tags.ts)

- 사용자 입력 태그는 DB 저장 전에 반드시 `parseTags(rawTags)`를 통해 정규화한다.
- 정규화 결과: trim → `#` 제거 → 공백을 `-`로 변환 → 소문자 → 중복 제거.

```typescript
// ✅ 태그 정규화 적용
const tags = parseTags(rawTags); // ["#Work", "idea", "idea"] → ["work", "idea"]
```

## 파일 및 모듈 컨벤션

- 파일명은 `kebab-case`를 사용한다 (예: `session-store.ts`, `parse-tags.ts`).
- import 경로는 `.js` 확장자를 명시한다 (ESM 모듈 시스템).
- 새 lib 모듈은 `src/lib/`에, 새 명령어는 `src/commands/`에 추가하고 `cli.ts`에 등록한다.

```typescript
// ✅ 올바른 import 패턴
import { requireAuthenticatedSession, createNotesClient } from '../lib/auth.js';
import { wrapSupabaseError, DraftyError } from '../lib/errors.js';
import { parseTags } from '../lib/parse-tags.js';
```

## CLI 등록 패턴 (cli.ts)

- 새 명령어는 `program.command('<이름>')`으로 등록하고 `.action(async (...) => { ... })`에서 명령어 함수를 호출한다.
- `.action()` 내부에서는 try/catch 없이 명령어 함수만 호출한다. 에러는 전역 catch에서 처리된다.

```typescript
// ✅ 명령어 등록
program
    .command('search <query>')
    .description('메모 검색')
    .action(async (query: string) => {
        await searchCommand(query);
    });
```
