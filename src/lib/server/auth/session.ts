import { dev } from '$app/environment';
import { getRuntimeEnv } from '$lib/server/env';
import { openJson, sealJson } from '$lib/server/auth/crypto';
import { refreshFirebaseIdToken, verifyFirebaseIdToken } from '$lib/server/auth/firebase';
import type { Cookies } from '@sveltejs/kit';
import { z } from 'zod';

export const AUTH_SESSION_ID_COOKIE_NAME = 'familySparkAuthSession';
export const AUTH_NEXT_COOKIE_NAME = 'familySparkAuthNext';

const AUTH_USER_COOKIE_NAME = 'familySparkAuth';
const LEARNER_USER_COOKIE_NAME = 'familySparkLearner';
const AUTH_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_REFRESH_SKEW_MS = 60_000;

const authSessionSchema = z.object({
	uid: z.string().min(1),
	email: z.string().email(),
	name: z.string().nullable(),
	photoUrl: z.string().url().nullable(),
	idToken: z.string().min(1),
	refreshToken: z.string().min(1),
	expiresAtMs: z.number().int().positive()
});

export type AuthSession = z.infer<typeof authSessionSchema>;

export type AuthUser = Pick<AuthSession, 'uid' | 'email' | 'name' | 'photoUrl'>;

const learnerSessionSchema = z.object({
	familyId: z.string().min(1),
	childId: z.string().min(1),
	displayName: z.string().min(1),
	deviceId: z.string().min(1),
	expiresAtMs: z.number().int().positive()
});

export type LearnerSession = z.infer<typeof learnerSessionSchema>;

export type AuthResult =
	| { status: 'ok'; session: AuthSession; user: AuthUser }
	| { status: 'signed_out' };

function toUser(session: AuthSession): AuthUser {
	return {
		uid: session.uid,
		email: session.email,
		name: session.name,
		photoUrl: session.photoUrl
	};
}

export function setAuthSessionIdCookie(cookies: Cookies, sessionId: string): void {
	const maxAge = 20 * 60;
	cookies.set(AUTH_SESSION_ID_COOKIE_NAME, sessionId, {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(Date.now() + maxAge * 1000),
		maxAge
	});
}

export function clearAuthSessionIdCookie(cookies: Cookies): void {
	cookies.set(AUTH_SESSION_ID_COOKIE_NAME, '', {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(0)
	});
}

export function setAuthNextCookie(cookies: Cookies, next: string): void {
	const maxAge = 20 * 60;
	cookies.set(AUTH_NEXT_COOKIE_NAME, next, {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(Date.now() + maxAge * 1000),
		maxAge
	});
}

export function clearAuthNextCookie(cookies: Cookies): void {
	cookies.set(AUTH_NEXT_COOKIE_NAME, '', {
		path: '/auth/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(0)
	});
}

export async function setAuthSessionCookie(cookies: Cookies, session: AuthSession, secret: string) {
	cookies.set(AUTH_USER_COOKIE_NAME, await sealJson(session, secret), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000),
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
	});
}

export function clearAuthSessionCookie(cookies: Cookies): void {
	cookies.set(AUTH_USER_COOKIE_NAME, '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(0)
	});
}

export async function setLearnerSessionCookie(
	cookies: Cookies,
	session: LearnerSession,
	secret: string
) {
	cookies.set(LEARNER_USER_COOKIE_NAME, await sealJson(session, secret), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(Date.now() + AUTH_COOKIE_MAX_AGE_SECONDS * 1000),
		maxAge: AUTH_COOKIE_MAX_AGE_SECONDS
	});
}

export function clearLearnerSessionCookie(cookies: Cookies): void {
	cookies.set(LEARNER_USER_COOKIE_NAME, '', {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		expires: new Date(0)
	});
}

export function createLearnerAuthUser(session: LearnerSession): AuthUser {
	return {
		uid: `learner:${session.familyId}:${session.childId}`,
		email: `learner-${session.childId}@family-spark.local`,
		name: session.displayName,
		photoUrl: null
	};
}

export function createAuthSession({
	uid,
	email,
	name,
	photoUrl,
	idToken,
	refreshToken,
	expiresInSeconds
}: {
	uid: string;
	email: string;
	name?: string | null;
	photoUrl?: string | null;
	idToken: string;
	refreshToken: string;
	expiresInSeconds: number;
}): AuthSession {
	return authSessionSchema.parse({
		uid,
		email: email.toLowerCase(),
		name: name ?? null,
		photoUrl: photoUrl ?? null,
		idToken,
		refreshToken,
		expiresAtMs: Date.now() + Math.max(1, expiresInSeconds - 10) * 1000
	});
}

async function refreshSessionIfNeeded(
	session: AuthSession,
	platformEnv?: unknown
): Promise<{ session: AuthSession; refreshed: boolean }> {
	if (Date.now() + TOKEN_REFRESH_SKEW_MS < session.expiresAtMs) {
		return { session, refreshed: false };
	}

	const refreshed = await refreshFirebaseIdToken({
		refreshToken: session.refreshToken,
		platformEnv
	});
	const env = getRuntimeEnv(platformEnv);
	const token = await verifyFirebaseIdToken(refreshed.id_token, env);
	return {
		session: createAuthSession({
			uid: refreshed.user_id,
			email: token.email ?? session.email,
			name: token.name ?? session.name,
			photoUrl: token.picture ?? session.photoUrl,
			idToken: refreshed.id_token,
			refreshToken: refreshed.refresh_token,
			expiresInSeconds: refreshed.expires_in
		}),
		refreshed: true
	};
}

export async function readAuthFromCookies(
	cookies: Cookies,
	platformEnv?: unknown
): Promise<AuthResult> {
	const sealed = cookies.get(AUTH_USER_COOKIE_NAME);
	if (!sealed) {
		return { status: 'signed_out' };
	}

	const env = getRuntimeEnv(platformEnv);
	try {
		const storedSession = await openJson(sealed, env.authCookieSecret, authSessionSchema);
		const { session, refreshed } = await refreshSessionIfNeeded(storedSession, platformEnv);
		const token = await verifyFirebaseIdToken(session.idToken, env);
		const checkedSession = createAuthSession({
			uid: token.user_id,
			email: token.email ?? session.email,
			name: token.name ?? session.name,
			photoUrl: token.picture ?? session.photoUrl,
			idToken: session.idToken,
			refreshToken: session.refreshToken,
			expiresInSeconds: Math.max(1, Math.floor((session.expiresAtMs - Date.now()) / 1000))
		});

		if (refreshed) {
			await setAuthSessionCookie(cookies, session, env.authCookieSecret);
		}

		return { status: 'ok', session: checkedSession, user: toUser(checkedSession) };
	} catch (error) {
		console.warn('Auth session cookie could not be read.', error);
		clearAuthSessionCookie(cookies);
		return { status: 'signed_out' };
	}
}

export async function readLearnerAuthFromCookies(
	cookies: Cookies,
	platformEnv?: unknown
): Promise<AuthUser | null> {
	const sealed = cookies.get(LEARNER_USER_COOKIE_NAME);
	if (!sealed) {
		return null;
	}

	const env = getRuntimeEnv(platformEnv);
	try {
		const session = await openJson(sealed, env.authCookieSecret, learnerSessionSchema);
		if (session.expiresAtMs < Date.now()) {
			clearLearnerSessionCookie(cookies);
			return null;
		}
		return createLearnerAuthUser(session);
	} catch (error) {
		console.warn('Learner session cookie could not be read.', error);
		clearLearnerSessionCookie(cookies);
		return null;
	}
}
