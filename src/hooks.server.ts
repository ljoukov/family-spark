import { readAuthFromCookies, readLearnerAuthFromCookies } from '$lib/server/auth/session';
import type { Handle } from '@sveltejs/kit';

const PUBLIC_PATHS = new Set(['/robots.txt']);

function isPublicPath(pathname: string): boolean {
	return (
		pathname.startsWith('/auth/') ||
		pathname === '/child-login' ||
		pathname === '/login-with-email' ||
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/favicon') ||
		PUBLIC_PATHS.has(pathname)
	);
}

function redirectToLogin(eventUrl: URL): Response {
	const loginUrl = new URL('/auth/login', eventUrl);
	loginUrl.searchParams.set('next', `${eventUrl.pathname}${eventUrl.search}`);
	return Response.redirect(loginUrl, 307);
}

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.user = null;

	if (isPublicPath(event.url.pathname)) {
		return await resolve(event);
	}

	const authResult = await readAuthFromCookies(event.cookies, event.platform?.env);
	if (authResult.status === 'signed_out') {
		const learnerUser = await readLearnerAuthFromCookies(event.cookies, event.platform?.env);
		if (!learnerUser) {
			return redirectToLogin(event.url);
		}
		event.locals.user = learnerUser;
		return await resolve(event);
	}

	event.locals.user = authResult.user;
	return await resolve(event);
};
