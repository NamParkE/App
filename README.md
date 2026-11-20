# 오픽 암기

가족이 함께 쓰는 영어 말하기 학습 웹앱(PWA)입니다. 첫 버전은 **오픽 암기형** 모드입니다.
빈출 주제마다 목표 등급(IM2 / IH / AL)에 맞는 핵심 답변 문장을 만들고, 마이크로 따라 말하면 모범 문장과 비교해 피드백합니다.

- 기획 의도와 승인된 화면 시안: [`docs/intent/english-opic-app.md`](docs/intent/english-opic-app.md)

## 구성

| 부분 | 사용 기술 | 비용 |
|---|---|---|
| 화면 / 서버 | Next.js 16 (Vercel 배포) | 무료 플랜 |
| 로그인 / DB | Supabase (Google 로그인, 이메일 링크 로그인, Postgres) | 무료 플랜 |
| 답변 만들기 / 코치 한마디 | Claude API (서버에서만 호출) | 사용량만큼 |
| 음성 인식(STT) / 음성 재생(TTS) | 안드로이드 크롬 내장 기능 | 무료 |
| 단어 비교 / 일치도 | 앱 안에서 계산 (`lib/diff.ts`) | 무료 |

### 비용 관리

- **AI 호출은 두 가지뿐입니다:** 주제별 답변 만들기(주제·등급마다 한 번만 하고 저장)와 틀린 문장의 코치 한마디. 다 맞게 말하면 AI를 부르지 않습니다.
- **사용자마다 하루 한도가 있습니다:** 기본 30회이고 한국 시간 자정에 다시 채워집니다. 한도를 다 쓰면 단어 비교 결과만 보여 줍니다.
- **모델:** 기본은 `claude-haiku-5-5`입니다. 대략적인 추정으로, 가족 4명이 매일 한도를 다 쓰면(월 3,600회) 월 수천 원 수준입니다. 품질을 더 높이려면 `CLAUDE_MODEL=claude-opus-5-5`로 바꿀 수 있지만 비용이 약 40배라 월 수만 원이 될 수 있습니다. 실제 사용량은 Anthropic 콘솔에서 확인하세요.

## 처음 설정하기 (한 번만)

### 1. Supabase

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다. 지역은 Northeast Asia (Seoul)를 추천합니다.
2. **SQL Editor**에서 [`supabase/migrations/`](supabase/migrations/)의 파일을 번호 순서대로(`0001_init.sql` → `0002_grants.sql`) 하나씩 통째로 붙여 넣고 실행합니다.
3. 같은 곳에서 관리자(가족 계정을 만들 사람) 이메일을 등록합니다.
   ```sql
   insert into public.owner_emails (email) values ('관리자@gmail.com');
   ```
   이 이메일만 "새 가족 만들기"를 할 수 있고, 나머지 가족은 초대 코드로만 들어옵니다. 모르는 사람이 로그인해도 API를 쓸 수 없습니다.
4. 로그인은 **이메일 + 비밀번호**입니다. Authentication → Providers → **Email**이 켜져 있으면 됩니다 (기본값). 처음 가입할 때 한 번 확인 메일이 갑니다.
   - (선택) Google 로그인: **Providers → Google**을 켜고 Google Cloud 콘솔의 OAuth 클라이언트 ID·Secret을 넣은 뒤, Vercel 환경 변수 `NEXT_PUBLIC_GOOGLE_LOGIN=on`을 추가하고 다시 배포하면 로그인 화면에 버튼이 나타납니다.
5. **Authentication → URL Configuration**
   - Site URL: `https://<배포 주소>`
   - Redirect URLs: `https://<배포 주소>/auth/callback` (로컬 개발 시 `http://localhost:3000/auth/callback`도 추가)
6. (권장) **Authentication → Emails → SMTP Settings**에서 메일 발송 계정을 설정합니다. Gmail이라면 Host `smtp.gmail.com`, Port `587`, Username·Sender email은 Gmail 주소, Password는 [앱 비밀번호](https://myaccount.google.com/apppasswords)입니다. 기본 발송은 시간당 몇 통으로 제한되고 메일 템플릿도 바꿀 수 없습니다.
7. (SMTP 설정 후) **Authentication → Emails → Templates**의 링크를 아래처럼 바꿉니다. 메일 앱 안의 브라우저처럼, 요청한 곳과 다른 브라우저에서 링크를 열어도 동작합니다.
   - **Confirm signup:** `<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">가입하고 로그인하기</a>`
   - **Reset Password:** `<a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery">비밀번호 설정하기</a>`

### 2. Vercel

1. 이 GitHub 저장소를 Vercel에서 Import 합니다.
2. Environment Variables에 [`.env.example`](.env.example)의 항목을 넣습니다.
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase → Project Settings → API
   - `ANTHROPIC_API_KEY`: Anthropic 콘솔에서 발급. 서버에서만 쓰이고 브라우저로 나가지 않습니다.
   - `CLAUDE_MODEL`: `claude-haiku-5-5` (비워 두어도 Haiku를 씁니다)
3. Deploy를 누릅니다.

### 속도: 서버 위치

`vercel.json`의 `regions`가 Vercel 서버 위치입니다. **Supabase 프로젝트와 같은 지역**이어야 빠릅니다. 서버와 DB가 멀면 화면마다 수백 ms씩 느려집니다. 현재는 `sin1`(싱가포르)로, Supabase `ap-southeast-1`에 맞춰 두었습니다. Supabase를 서울(`ap-northeast-2`)에 만들었다면 `icn1`으로 바꾸세요.

### 3. 폰에 설치

1. 관리자가 안드로이드 크롬에서 배포 주소를 열고 로그인한 뒤 **새 가족 만들기**를 누릅니다.
2. **내 정보** 화면의 6자리 초대 코드를 가족에게 알려 줍니다.
3. 각자 크롬 메뉴의 **홈 화면에 추가**를 누르면 앱처럼 설치됩니다. 처음 녹음할 때 마이크 권한을 허용하세요.

### 사용량 한도 바꾸기

Supabase SQL Editor에서 실행합니다.

```sql
update public.profiles set daily_limit = 50 where display_name = '민지';
```

## 학습 규칙

- 연습은 **보면서 말하기**와 **가리고 말하기**(한글 뜻만 보고 영어로 말하기) 두 가지입니다.
- 가리고 말하기에서 일치도 **90% 이상**이면 그 문장은 "외움"이 됩니다 (`lib/types.ts`의 `MEMORIZED_SCORE`).
- 일치도는 단어 단위로 비교합니다. 숫자(12th ↔ twelfth)와 축약형(it's ↔ it is)은 같은 것으로 보고, AI가 괜찮다고 판단한 바꿔 말하기(house ↔ place 등)는 맞은 것으로 칩니다.

## 개발

```bash
npm install
cp .env.example .env.local   # 값 채우기
npm run dev                  # http://localhost:3000
npm test                     # 단어 비교 테스트
npm run lint                 # 타입 검사
```

### 보안과 버전 관리

- 의존성 버전은 정확히 고정합니다 (`.npmrc`의 `save-exact`, `package-lock.json`). 새로 배포된 패키지가 자동으로 섞여 들어오지 않습니다.
- 버전을 올릴 때는 `npm audit`이 0건인지 확인합니다. Next.js 15.x의 마지막 버전은 취약한 PostCSS를 포함하고 있어 16.x를 씁니다.
- 모든 표는 Supabase RLS로 보호됩니다. 사용자는 자기 데이터만 읽고 쓰며, 하루 한도와 가족 소속은 바꿀 수 없습니다.

## 폴더 구조

```
app/
  login, join, setup        로그인 → 가족 가입 → 목표 등급 선택
  home, topic/[id]          주제 목록 → 주제별 핵심 답변
  practice/[id]             말하기 연습과 비교 피드백
  history, me               기록(준비 중), 내 정보
  api/generate              핵심 답변 만들기 (Claude)
  api/feedback              비교 + 코치 한마디 (Claude)
lib/
  diff.ts                   단어 비교와 일치도 계산
  claude.ts                 Claude API 호출
  speech.ts                 브라우저 음성 인식과 재생
supabase/migrations/        DB 스키마, 보안 정책, 오픽 주제
```
