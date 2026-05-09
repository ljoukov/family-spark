import { createGoogleAuthUri } from '$lib/server/auth/firebase';
import {
	clearAuthNextCookie,
	clearAuthSessionCookie,
	setAuthNextCookie,
	setAuthSessionIdCookie
} from '$lib/server/auth/session';
import { clientSideRedirect } from '$lib/server/http';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const LOCALHOST_ALIASES = new Set(['127.0.0.1', '0.0.0.0', '::1', '[::1]']);

function safeNext(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) {
		return '/';
	}
	return value;
}

function canonicalizeLocalStartUrl(url: URL): URL | null {
	if (!LOCALHOST_ALIASES.has(url.hostname)) {
		return null;
	}

	const canonicalUrl = new URL(url);
	canonicalUrl.hostname = 'localhost';
	return canonicalUrl;
}

export const GET: RequestHandler = async ({ url, cookies, platform }) => {
	const canonicalUrl = canonicalizeLocalStartUrl(url);
	if (canonicalUrl) {
		throw redirect(307, canonicalUrl.toString());
	}

	clearAuthSessionCookie(cookies);
	clearAuthNextCookie(cookies);
	const next = safeNext(url.searchParams.get('next'));
	const continueUri = new URL('/auth/continue', url);
	const authUri = await createGoogleAuthUri({
		continueUri,
		platformEnv: platform?.env
	});
	setAuthSessionIdCookie(cookies, authUri.sessionId);
	setAuthNextCookie(cookies, next);
	return clientSideRedirect(new URL(authUri.authUri));
};
