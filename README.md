# Family Spark

SvelteKit chat app deployed as a Cloudflare Worker.

## Stack

- SvelteKit, Svelte 5, TypeScript
- Cloudflare Workers via `@sveltejs/adapter-cloudflare`
- Firebase Auth through server-only Identity Toolkit REST calls
- `@ljoukov/llm` with `gpt-5.5-fast` and medium thinking
- Cloudflare Durable Objects, binding `CHAT_ROOMS`

## Environment

Local `.env.local` is ignored by git. Runtime secrets synced to Cloudflare are:

```sh
GOOGLE_SERVICE_ACCOUNT_JSON=
GOOGLE_API_KEY=
AUTH_COOKIE_SECRET=
FIREBASE_PROJECT_ID=
OPENAI_API_KEY=
```

`GOOGLE_SERVICE_ACCOUNT_JSON` should contain the full Firebase Admin SDK JSON as a
single-line JSON value.

Optional local test-only values:

```sh
TEST_USER_EMAIL=
TEST_USER_PASSWORD=
```

The chat runtime uses the OpenAI API key path. ChatGPT subscription-token
settings may remain in local env files for testing, but they are not required
for the deployed chat model.

## Develop

```sh
npm install
scripts/dev-server.sh start
```

Main auth is Google through `/auth/start`. The hidden email-password test route
is `/login-with-email`.

Child access is parent-owned by default: adults create learner profiles in
`/family`, set a PIN, and children use `/child-login` with family code + profile
name + PIN. Optional child email/password accounts are only a compatibility
path for older teen or test flows.

## Validate

```sh
npm run check
npm run lint
npm run build
```

## Cloudflare

```sh
npm run secrets:cloudflare
npm run deploy
```

GitHub Actions deploys pushes to `main` using repository secrets
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
