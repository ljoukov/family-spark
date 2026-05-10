import {
	clearAuthNextCookie,
	clearAuthSessionCookie,
	clearAuthSessionIdCookie,
	clearLearnerSessionCookie
} from '$lib/server/auth/session';
import type { PageServerLoad } from './$types';

function safeNext(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) {
		return '/';
	}
	return value;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
	clearAuthNextCookie(cookies);
	clearAuthSessionIdCookie(cookies);
	clearAuthSessionCookie(cookies);
	clearLearnerSessionCookie(cookies);
	return {
		next: safeNext(url.searchParams.get('next'))
	};
};
