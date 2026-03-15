# Drafty PLAN.md

## 1. 문서 목적

이 문서는 **Drafty**의 초기 제품 방향과 구현 계획을 정의한다.

Drafty는 터미널 중심 사용자에게 최적화된 개인 메모 도구다. 사용자는 CLI에서 빠르게 메모를 작성하고, 해당 메모는 사용자 계정별로 안전하게 저장된다. 현재 단계의 핵심은 **좋은 입력 경험**, **계정 기반 저장**, **안정적인 CLI 사용성**이다.

---

## 2. 제품 한 줄 정의

> `drafty tag1 tag2` 를 실행하면 시스템 에디터가 열리고, 작성한 메모가 로그인된 사용자 계정으로 저장되는 CLI 메모 앱

---

## 3. 제품 목표

### 3.1 현재 목표

현재 제품의 목표는 다음 네 가지다.

1. 사용자가 CLI에서 빠르게 메모를 작성할 수 있어야 한다.
2. 사용자는 CLI에서 로그인하고 자신의 계정으로 메모를 저장할 수 있어야 한다.
3. 메모는 태그와 함께 구조적으로 저장되어야 한다.
4. 이후 웹 앱으로 확장할 수 있는 데이터 구조와 인증 구조를 갖춰야 한다.

### 3.2 비목표

현재 단계에서는 아래 항목은 구현하지 않는다.

- 요약 생성
- 의미 검색 / 벡터 검색
- 무한 캔버스 웹 UI
- 협업 기능
- 공유 링크
- 파일 첨부
- 브라우저 콜백 서버 기반 로그인

---

## 4. 핵심 사용자 경험

### 4.1 메모 작성

사용자는 다음과 같이 명령한다.

```bash
drafty work idea
```

CLI는 다음 순서로 동작한다.

1. 태그를 파싱한다.
2. 로그인 상태를 확인한다.
3. 로그인되어 있지 않다면 로그인 안내를 출력한다.
4. 로그인되어 있다면 시스템 에디터 입력창을 연다.
5. 사용자가 메모를 작성하고 저장 후 종료한다.
6. 메모 본문과 태그를 계정에 연결해 저장한다.
7. 저장 성공 메시지와 메모 ID를 출력한다.

### 4.2 로그인

사용자는 다음 명령으로 로그인한다.

```bash
drafty login
```

초기 구현에서는 **이메일 OTP 로그인**을 사용한다.

중요 전제:

- 사용자는 브라우저에서 링크를 여는 대신, 이메일에 도착한 6자리 코드를 터미널에 입력해야 한다.
- 로그인 메일이 링크 클릭만 요구한다면 Supabase Auth 템플릿 설정이 잘못된 것이다.
- Drafty는 현재 브라우저 리다이렉트 세션 파싱을 지원하지 않는다.

흐름:

1. 사용자가 이메일을 입력한다.
2. Supabase Auth가 해당 이메일로 코드형 OTP를 전송한다.
3. 사용자가 CLI에 OTP를 입력한다.
4. CLI가 세션을 저장한다.
5. 이후 메모 저장 시 이 세션을 사용한다.

### 4.3 로그아웃

```bash
drafty logout
```

로그아웃 시 로컬 세션을 제거한다.

### 4.4 현재 사용자 확인

```bash
drafty whoami
```

현재 로그인된 이메일 또는 사용자 식별 정보를 출력한다.

---

## 7. 기술 선택

### 7.1 언어 및 런타임

- **TypeScript**
- **Node.js**

선정 이유:

- 개발자가 가장 자신 있는 언어가 TypeScript다.
- CLI 개발 생태계가 안정적이다.
- Supabase와 연동이 쉽다.
- 이후 웹 프론트엔드로 확장하기도 자연스럽다.

### 7.2 CLI 프레임워크

- **Commander**

선정 이유:

- 단순한 커맨드 설계에 적합하다.
- 향후 `list`, `show`, `login`, `logout` 같은 명령 확장에 유리하다.
- Help 및 인자 처리 구조가 명확하다.

### 7.3 데이터 저장소 및 인증

- **Supabase**
- **Supabase Auth**
- **@supabase/supabase-js**

선정 이유:

- 사용자 계정 관리가 가능하다.
- Postgres 기반으로 데이터 구조를 확장하기 쉽다.
- CLI에서 직접 auth + insert + select 흐름을 구현할 수 있다.
- 이후 웹앱 확장 시 인증/데이터 계층을 재사용할 수 있다.

### 7.4 에디터 실행

- Node.js 내장 모듈 **child_process.spawnSync()**

선정 이유:

- 외부 의존성 없이 구현할 수 있다.
- 사용자가 에디터를 종료할 때까지 기다리는 CLI UX와 잘 맞는다.
- Vim, Neovim, 기타 에디터 실행 흐름을 단순하게 구성할 수 있다.

---

## 8. CLI 명령 설계

초기 버전에서 지원할 명령은 다음과 같다.

### 8.1 메모 작성

```bash
drafty tag1 tag2
```

설명:

- 태그를 파싱한다.
- 에디터를 열어 본문을 입력받는다.
- 로그인된 사용자 계정으로 메모를 저장한다.

### 8.2 로그인

```bash
drafty login
```

설명:

- 이메일을 입력받는다.
- OTP를 발송한다.
- OTP를 검증한다.
- 세션을 로컬에 저장한다.

### 8.3 로그아웃

```bash
drafty logout
```

설명:

- 로컬 세션을 삭제한다.

### 8.4 사용자 확인

```bash
drafty whoami
```

설명:

- 현재 로그인된 사용자를 출력한다.

### 8.5 메모 목록

```bash
drafty list
```

설명:

- 현재 로그인된 사용자의 최근 active 메모 목록을 보여준다.
- archived 메모는 기본 목록에서 숨긴다.

### 8.6 단일 메모 조회

```bash
drafty show <id>
```

설명:

- 현재 사용자 소유의 메모 중 해당 ID를 조회한다.
- archived 메모도 ID로는 계속 조회할 수 있다.

### 8.7 메모 편집

```bash
drafty edit <id>
```

설명:

- 현재 사용자 소유의 active 메모를 편집한다.
- archived 메모는 조회만 가능하며 편집은 허용하지 않는다.

### 8.8 메모 제거

```bash
drafty rm <id>
drafty rm
```

설명:

- 실제 row 삭제 대신 `status = 'archived'` 로 전환하는 soft delete를 수행한다.
- `drafty rm <id>` 는 단건 제거, `drafty rm` 은 TTY에서만 다중 선택 제거를 지원한다.
- 제거 전에는 항상 한 번 확인한다.

---

## 9. 에디터 UX 명세

### 9.1 입력 방식

메모 본문은 쉘 인자로 직접 입력하지 않고, **시스템 에디터에서 작성**한다.

기본 경험:

```bash
drafty project meeting
```

실행 후 시스템 에디터가 열린다.

### 9.2 에디터 선택 우선순위

에디터는 다음 우선순위로 선택한다.

1. `VISUAL`
2. `EDITOR`
3. Windows에서는 `notepad`
4. macOS/Linux에서는 `vim`

즉, 사용자가 환경변수를 설정해두었다면 그 값을 사용하고, 그렇지 않으면 운영체제에 맞는 기본 에디터를 사용한다.

### 9.3 빈 메모 처리

다음 경우에는 저장하지 않는다.

- 파일이 비어 있음
- 공백만 있음

CLI는 사용자에게 저장되지 않았음을 출력한다.

### 9.4 저장 성공 출력

예시:

```bash
Saved note: 3f0d9d2b-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Tags: project, meeting
```

---

## 10. 인증 및 계정 설계

### 10.1 인증 방식

초기 버전은 **이메일 OTP 기반 로그인**을 사용한다.

운영 전제:

- Supabase Auth의 `Magic Link`와 `Confirm sign up` 이메일 템플릿은 `{{ .Token }}` 중심으로 구성한다.
- `SITE_URL`은 localhost 기본값에 묶어두지 않고, 사용자가 열어도 무해한 문서 또는 프로젝트 랜딩 URL로 설정한다.
- 신규 사용자 경로와 기존 사용자 경로 모두 메일 본문이 링크가 아니라 코드여야 한다.

선정 이유:

- CLI에서 구현이 쉽다.
- 비밀번호 관리 UX가 필요 없다.
- 사용자 계정 기반 저장에 충분하다.
- 이후 웹앱에서도 같은 인증 시스템을 재사용할 수 있다.

### 10.2 세션 저장 방식

로그인 성공 후, CLI는 세션을 로컬 파일에 저장한다.

예시 위치:

- Windows: `%APPDATA%/Drafty/session.json`
- macOS/Linux: `XDG_CONFIG_HOME/drafty/session.json` 또는 `~/.config/drafty/session.json`

저장 정보 예시:

- access token
- refresh token
- user id
- email
- expires at

### 10.3 세션 사용 방식

CLI 실행 시:

1. 로컬 세션 파일을 확인한다.
2. 유효한 세션이 있으면 그대로 사용한다.
3. access token이 만료되었으면 refresh token으로 갱신을 시도한다.
4. 갱신 실패 시 다시 로그인하도록 안내한다.

---

## 11. 데이터 모델

초기 버전에서는 단일 핵심 테이블로 시작한다.

### 11.1 notes 테이블

| 필드명     | 타입        | 설명                                |
| ---------- | ----------- | ----------------------------------- |
| id         | uuid        | 기본 키                             |
| user_id    | uuid        | 소유자 ID (Supabase Auth 사용자 ID) |
| body       | text        | 메모 본문                           |
| cli_tags   | text[]      | CLI에서 입력한 태그                 |
| status     | text        | 메모 상태                           |
| created_at | timestamptz | 생성 시각                           |
| updated_at | timestamptz | 수정 시각                           |

### 11.2 상태값

초기 버전에서는 상태값을 단순하게 유지한다.

예:

- `active`
- `archived`

기본값은 `active` 로 한다.

### 11.3 현재 제외되는 필드

아래 필드는 현재 넣지 않는다.

- `summary`
- `category`
- `embedding`

---

## 12. 보안 및 접근 제어

### 12.1 Row Level Security

`notes` 테이블에는 반드시 **RLS(Row Level Security)** 를 활성화한다.

### 12.2 정책 원칙

각 사용자는 자신의 메모만 읽고, 저장하고, 수정하고, 삭제할 수 있어야 한다.

정책 원칙:

- Select: `auth.uid() = user_id`
- Insert: `auth.uid() = user_id`
- Update: `auth.uid() = user_id`
- Delete: `auth.uid() = user_id`

이를 통해 CLI에서 어떤 계정으로 로그인했는지에 따라 접근 가능한 데이터가 자동으로 제한된다.

---

## 13. 프로젝트 구조

```text
drafty/
  src/
    cli.ts
    commands/
      capture.ts
      edit.ts
      interactive-edit.ts
      interactive-remove.ts
      login.ts
      logout.ts
      whoami.ts
      list.ts
      remove.ts
      show.ts
    lib/
      auth.ts
      editor.ts
      errors.ts
      notes.ts
      parse-tags.ts
      prompt.ts
      supabase.ts
      session-store.ts
      config.ts
    types/
      database.types.ts
  package.json
  tsconfig.json
  .env
```

### 13.1 파일 역할

- `cli.ts`: CLI 엔트리포인트
- `commands/capture.ts`: 메모 작성 및 저장 흐름
- `commands/edit.ts`: 단일 메모 편집 흐름
- `commands/interactive-edit.ts`: TTY 편집 선택 프롬프트
- `commands/interactive-remove.ts`: TTY 제거 선택 및 확인 프롬프트
- `commands/login.ts`: 로그인 흐름
- `commands/logout.ts`: 로그아웃 흐름
- `commands/whoami.ts`: 현재 사용자 확인
- `commands/list.ts`: 최근 메모 목록 조회
- `commands/remove.ts`: 단일/다중 메모 soft delete 흐름
- `commands/show.ts`: 단일 메모 조회
- `lib/auth.ts`: OTP 로그인 및 세션 처리
- `lib/editor.ts`: 에디터 실행 및 임시 파일 처리
- `lib/errors.ts`: 사용자 친화적 에러 포맷팅
- `lib/notes.ts`: 메모 조회, 편집, soft delete 도메인 로직
- `lib/parse-tags.ts`: 태그 파싱
- `lib/prompt.ts`: 터미널 입력 및 확인 프롬프트 헬퍼
- `lib/supabase.ts`: Supabase 클라이언트 생성
- `lib/session-store.ts`: 세션 파일 읽기/쓰기
- `types/database.types.ts`: Supabase 타입 정의

---

## 14. 구현 단계

### 14.1 1단계: 프로젝트 초기화

목표:

- TypeScript 기반 CLI 프로젝트 생성
- Commander 설정
- 기본 실행 구조 확보

작업:

- npm 프로젝트 초기화
- TypeScript 설정
- `tsx` 기반 개발 실행 환경 구성
- Commander 엔트리 작성

### 14.2 2단계: 인증 구현

목표:

- `drafty login`, `logout`, `whoami` 동작

작업:

- Supabase Auth 연동
- 이메일 OTP 요청
- OTP 검증
- 세션 저장 및 로딩 로직 구현
- 로그아웃 시 세션 제거

### 14.3 3단계: 메모 작성 UX 구현

목표:

- `drafty tag1 tag2` 실행 시 에디터가 열리고 본문을 받을 수 있어야 한다.

작업:

- 태그 파싱
- 임시 파일 생성
- 에디터 실행
- 본문 읽기
- 빈 본문 처리

### 14.4 4단계: 메모 저장 구현

목표:

- 로그인된 사용자 계정으로 메모를 저장한다.

작업:

- `notes` 테이블 생성
- `user_id` 포함 insert 구현
- 저장 성공 출력
- 에러 메시지 정리

### 14.5 5단계: 조회 및 라이프사이클 명령 구현

목표:

- 사용자별 메모 목록, 단일 조회, 편집, soft delete 구현

작업:

- `drafty list`
- `drafty show <id>`
- `drafty edit <id>`
- `drafty rm <id>` / `drafty rm`
- 최근 순 정렬
- 본인 소유 메모만 출력
- archived 메모 기본 숨김 및 조회 전용 유지

### 14.6 6단계: 타입 안정성 강화

목표:

- DB 쿼리의 타입 안정성 확보

작업:

- Supabase CLI로 타입 생성
- `createClient<Database>()` 적용

---

## 15. 성공 조건

아래 조건을 만족하면 초기 버전이 완료된 것으로 본다.

1. 사용자가 `drafty login` 으로 로그인할 수 있다.
2. 로그인 세션이 로컬에 저장된다.
3. `drafty whoami` 로 현재 계정을 확인할 수 있다.
4. `drafty work idea` 실행 시 시스템 에디터가 열린다.
5. 메모를 작성하고 종료하면 현재 사용자 계정으로 저장된다.
6. 빈 메모는 저장되지 않는다.
7. `drafty list` 로 자신의 메모 목록을 확인할 수 있다.
8. RLS가 적용되어 다른 사용자의 메모에 접근할 수 없다.
9. `drafty rm` 으로 메모를 soft delete 하면 목록에서 사라지지만 `drafty show <id>` 로는 계속 확인할 수 있다.
10. archived 메모는 `drafty edit <id>` 로 수정할 수 없다.

---

## 16. 이후 확장 방향

초기 버전이 안정화된 후 고려할 수 있는 확장 방향은 다음과 같다.

### 16.1 편집 기능

- `drafty edit <id>`
- 기존 메모를 다시 에디터로 열기
- 수정 후 저장

### 16.2 메모 라이프사이클 확장

- archived 메모 복구
- archived 포함 목록 조회
- 영구 삭제 정책 검토

### 16.3 태그 관리

- 태그 기준 필터링
- 태그 목록 조회
- 태그 정렬

### 16.3 웹 앱 연동

- 계정별 메모 목록 웹 뷰
- 메모 상세 보기
- 태그 필터링
- 이후 캔버스형 인터페이스로 확장

### 16.4 동기화 경험 개선

- 오프라인 임시 저장
- 재시도 큐
- 네트워크 장애 시 복구

---

## 17. 최종 결론

Drafty의 첫 버전은 **계정 기반 CLI 메모 도구**다.

가장 중요한 것은 다음 세 가지다.

1. 빠르게 열리는 입력 경험
2. 로그인된 사용자 기준의 안전한 저장
3. 이후 웹 제품으로 확장 가능한 구조

이를 위해 현재 최적의 기술 선택은 다음과 같다.

- **TypeScript + Node.js**
- **Commander**
- **Supabase + Supabase Auth**
- **child_process.spawnSync() 기반 에디터 실행**
- **RLS 기반 사용자별 데이터 보호**

Drafty의 현재 범위는 명확하다.

> `drafty 태그1 태그2` 로 메모를 쓰고, 로그인된 내 계정에 안전하게 저장하는 것

이 범위를 먼저 단단하게 만드는 것이 가장 중요하다.
