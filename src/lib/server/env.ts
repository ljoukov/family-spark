import { env as privateEnv } from '$env/dynamic/private';
import { z } from 'zod';

const ENV_KEYS = [
	'GOOGLE_SERVICE_ACCOUNT_JSON',
	'GOOGLE_API_KEY',
	'AUTH_COOKIE_SECRET',
	'FIREBASE_PROJECT_ID',
	'OPENAI_API_KEY'
] as const;

const LLM_PROCESS_ENV_KEYS = ['OPENAI_API_KEY'] as const;

const serviceAccountSchema = z.object({
	project_id: z.string().min(1),
	client_email: z.string().email(),
	private_key: z.string().min(1)
});

const runtimeEnvSchema = z.object({
	GOOGLE_SERVICE_ACCOUNT_JSON: z.string().min(1),
	GOOGLE_API_KEY: z.string().min(1),
	AUTH_COOKIE_SECRET: z.string().min(32),
	FIREBASE_PROJECT_ID: z.string().min(1).optional()
});

export type RuntimeEnv = {
	googleApiKey: string;
	authCookieSecret: string;
	projectId: string;
	serviceAccountEmail: string;
};

function readPlatformEnv(platformEnv?: unknown): Record<string, string> {
	if (!platformEnv || typeof platformEnv !== 'object') {
		return {};
	}

	const values: Record<string, string> = {};
	for (const key of ENV_KEYS) {
		const value = (platformEnv as Record<string, unknown>)[key];
		if (typeof value === 'string') {
			values[key] = value;
		}
	}
	return values;
}

export function getRuntimeEnv(platformEnv?: unknown): RuntimeEnv {
	const raw = runtimeEnvSchema.parse({
		...privateEnv,
		...readPlatformEnv(platformEnv)
	});
	const serviceAccount = serviceAccountSchema.parse(JSON.parse(raw.GOOGLE_SERVICE_ACCOUNT_JSON));
	const projectId = raw.FIREBASE_PROJECT_ID ?? serviceAccount.project_id;
	if (projectId !== serviceAccount.project_id) {
		throw new Error('FIREBASE_PROJECT_ID does not match the service account project.');
	}

	return {
		googleApiKey: raw.GOOGLE_API_KEY,
		authCookieSecret: raw.AUTH_COOKIE_SECRET,
		projectId,
		serviceAccountEmail: serviceAccount.client_email
	};
}

export function installLlmProcessEnv(platformEnv?: unknown): void {
	const processEnv = (
		globalThis as typeof globalThis & {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
	if (!processEnv) {
		return;
	}

	const values = {
		...privateEnv,
		...readPlatformEnv(platformEnv)
	};

	for (const key of LLM_PROCESS_ENV_KEYS) {
		const value = values[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			processEnv[key] = value;
		}
	}
}
