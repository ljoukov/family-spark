import { getRuntimeEnv } from '$lib/server/env';
import { signInWithGoogleRedirect, verifyFirebaseIdToken } from '$lib/server/auth/firebase';
import {
	clearAuthSessionCookie,
	clearAuthNextCookie,
	clearAuthSessionIdCookie,
	createAuthSession,
	AUTH_NEXT_COOKIE_NAME,
	AUTH_SESSION_ID_COOKIE_NAME,
	setAuthSessionCookie
} from '$lib/server/auth/session';
import { clientSideRedirect } from '$lib/server/http';
import { error, type RequestHandler } from '@sveltejs/kit';

function safeNext(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) {
		return '/';
	}
	return value;
}

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const code = url.searchParams.get('code');
	if (!code) {
		throw error(400, 'Missing Google OAuth code.');
	}

	const sessionId = cookies.get(AUTH_SESSION_ID_COOKIE_NAME);
	if (!sessionId) {
		throw error(400, 'Missing Google auth session cookie.');
	}

	const signIn = await signInWithGoogleRedirect({
		requestUri: url,
		sessionId,
		platformEnv: platform?.env
	});
	const env = getRuntimeEnv(platform?.env);
	const token = await verifyFirebaseIdToken(signIn.idToken, env);
	const email = (token.email ?? signIn.email ?? '').toLowerCase();
	if (!email) {
		clearAuthSessionIdCookie(cookies);
		clearAuthSessionCookie(cookies);
		throw error(400, 'Google account did not provide an email address.');
	}

	const session = createAuthSession({
		uid: signIn.localId,
		email,
		name: token.name ?? signIn.displayName ?? null,
		photoUrl: token.picture ?? signIn.photoUrl ?? null,
		idToken: signIn.idToken,
		refreshToken: signIn.refreshToken,
		expiresInSeconds: signIn.expiresIn
	});

	clearAuthSessionIdCookie(cookies);
	const next = safeNext(cookies.get(AUTH_NEXT_COOKIE_NAME) ?? '/');
	clearAuthNextCookie(cookies);
	await setAuthSessionCookie(cookies, session, env.authCookieSecret);
	return clientSideRedirect(new URL(next, url));
};
