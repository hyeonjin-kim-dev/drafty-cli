# Drafty CLI 기여 가이드

[English](CONTRIBUTING.md)

## 준비 사항

- Node.js 20 이상
- npm
- Supabase 프로젝트
- `npx supabase`로 실행 가능한 Supabase CLI

## 설정

```bash
git clone https://github.com/hyeonjin-kim-dev/drafty-cli.git
cd drafty-cli
npm install
```

저장소 로컬 개발을 위해 `.env.example`을 `.env`로 복사해도 되고, `drafty login`으로 동일한 값을 사용자별 설정 파일에 저장해도 됩니다.

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_PROJECT_ID=your-project-ref
```

`SUPABASE_PROJECT_ID`는 `npm run db:types`에서 사용합니다. 저장소가 이미 `npx supabase link`로 연결되어 있다면, 연결된 프로젝트 ref도 사용할 수 있습니다.

## 데이터베이스

Drafty는 현재 anon key 접근을 사용하는 단일 사용자 notes 테이블을 사용합니다. 프로젝트 초기화 또는 업데이트는 이 저장소 기준으로 진행합니다.

```bash
npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push
npm run db:types
```

저장소에 포함된 마이그레이션이 단일 진실 공급원입니다. 배포된 npm 패키지는 자체적으로 스키마 변경을 적용하지 않습니다.

## 개발

소스에서 직접 CLI 실행:

```bash
npm run dev -- --help
npm run dev -- login
npm run dev -- work idea
```

빌드된 CLI 실행:

```bash
npm run build
npm run cli -- --help
```

전역 링크로 로컬 테스트:

```bash
npm run link:global
drafty login
```

유용한 스크립트:

```bash
npm run check          # typecheck + build
npm run dev:watch      # 변경 시 재빌드
npm run db:push        # 저장소 마이그레이션 적용
npm run db:types       # database.types.ts 재생성
```

## 프로젝트 구조

```
src/
  cli.ts             # 진입점, Commander 등록, 최상위 에러 처리
  commands/          # 명령어별 파일
  lib/               # 핵심 모듈 (config, supabase, errors, notes, editor, prompt, parse-tags, npm-update, package-meta)
  types/             # Supabase 기반 생성 파일 database.types.ts
supabase/            # config.toml, migrations
```

## 규칙

- **ESM import**: 항상 `.js` 확장자를 사용
- **파일 이름**: `kebab-case` 사용
- **에러 처리**: `DraftyError` 또는 `wrapSupabaseError()` 사용, bare `new Error()` 금지
- **Supabase 접근**: `createNotesClient()`와 `src/lib/config.ts`의 설정 헬퍼 우선 사용
- **Supabase 결과 처리**: 항상 `{ data, error }`를 구조 분해하고 `error`를 먼저 확인
- **생성 타입 갱신**: `src/types/database.types.ts`는 `npm run db:types`로 갱신

## 배포

```bash
npm login
npm run check
npm version patch   # 또는 minor / major
npm publish
```

배포 후 전역 npm 설치 사용자는 아래처럼 업데이트할 수 있습니다.

```bash
drafty update
```

`drafty update`는 전역 npm 설치(`npm install -g drafty-cli`)에서만 동작합니다. 릴리스에 마이그레이션이 포함되어 있어도 Supabase 스키마 변경은 자동 적용하지 않으므로, 사용자가 저장소에서 `npm run db:push`를 직접 실행해야 합니다.

패키징 전에는 `prepack` 스크립트가 자동으로 `npm run check`를 실행합니다.
