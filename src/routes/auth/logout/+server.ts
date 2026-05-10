import {
	clearAuthNextCookie,
	clearAuthSessionCookie,
	clearAuthSessionIdCookie,
	clearLearnerSessionCookie
} from '$lib/server/auth/session';
import { clientSideRedirect } from '$lib/server/http';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	clearAuthNextCookie(cookies);
	clearAuthSessionIdCookie(cookies);
	clearAuthSessionCookie(cookies);
	clearLearnerSessionCookie(cookies);
	return clientSideRedirect(new URL('/auth/login', url));
};
