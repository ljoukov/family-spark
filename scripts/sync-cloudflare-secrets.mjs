import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const REQUIRED_RUNTIME_SECRET_KEYS = [
	'GOOGLE_API_KEY',
	'AUTH_COOKIE_SECRET',
	'FIREBASE_PROJECT_ID',
	'OPENAI_API_KEY'
];

function unquote(value) {
	const trimmed = value.trim();
	if (trimmed.length < 2) {
		return trimmed;
	}
	const quote = trimmed[0];
	if ((quote !== '"' && quote !== "'") || trimmed[trimmed.length - 1] !== quote) {
		return trimmed;
	}
	const inner = trimmed.slice(1, -1);
	if (quote === '"') {
		return inner.replaceAll('\\n', '\n').replaceAll('\\"', '"');
	}
	return inner;
}

function parseDotenv(text) {
	const entries = {};
	const lines = text.split(/\r?\n/u);
	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (!line || line.trim().length === 0 || line.trimStart().startsWith('#')) {
			continue;
		}
		const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
		if (!match) {
			continue;
		}
		const key = match[1];
		let value = match[2] ?? '';
		const quote = value.trimStart()[0];
		if ((quote === '"' || quote === "'") && !value.trimEnd().endsWith(quote)) {
			while (index + 1 < lines.length) {
				index += 1;
				value += `\n${lines[index]}`;
				if (lines[index]?.trimEnd().endsWith(quote)) {
					break;
				}
			}
		}
		entries[key] = unquote(value);
	}
	return entries;
}

function requireValue(env, key) {
	const value = env[key];
	if (!value || value.trim().length === 0) {
		throw new Error(`Missing ${key} in .env.local`);
	}
	return value;
}

const envPath = path.resolve('.env.local');
const parsedEnv = parseDotenv(fs.readFileSync(envPath, 'utf8'));
const secrets = {
	GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(
		JSON.parse(requireValue(parsedEnv, 'GOOGLE_SERVICE_ACCOUNT_JSON'))
	)
};

for (const key of REQUIRED_RUNTIME_SECRET_KEYS) {
	secrets[key] = requireValue(parsedEnv, key);
}

const tempDir = await mkdtemp(path.join(tmpdir(), 'family-spark-secrets-'));
const secretsPath = path.join(tempDir, 'secrets.json');

try {
	await writeFile(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`);
	const result = spawnSync('npx', ['wrangler', 'secret', 'bulk', secretsPath], {
		stdio: 'inherit',
		env: {
			...process.env,
			CLOUDFLARE_ACCOUNT_ID: parsedEnv.CLOUDFLARE_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID,
			CLOUDFLARE_API_TOKEN:
				parsedEnv.CLOUDFLARE_API_TOKEN ??
				parsedEnv.CLOUDFLARE_ACCOUNT_ACCESS_TOKEN ??
				process.env.CLOUDFLARE_API_TOKEN
		}
	});
	if (result.status !== 0) {
		throw new Error(`wrangler secret bulk exited with ${result.status}`);
	}
} finally {
	await rm(tempDir, { recursive: true, force: true });
}
