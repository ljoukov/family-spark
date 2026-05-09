import { getRuntimeEnv } from '$lib/server/env';
import { signInWithEmailPassword, verifyFirebaseIdToken } from '$lib/server/auth/firebase';
import {
	clearAuthSessionCookie,
	clearAuthSessionIdCookie,
	createAuthSession,
	setAuthSessionCookie
} from '$lib/server/auth/session';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function safeNext(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) {
		return '/';
	}
	return value;
}

export const load: PageServerLoad = async ({ url }) => {
	return {
		next: safeNext(url.searchParams.get('next'))
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const data = await request.formData();
		const email = String(data.get('email') ?? '')
			.trim()
			.toLowerCase();
		const password = String(data.get('password') ?? '');
		const next = safeNext(String(data.get('next') ?? '/'));

		if (!email || !password) {
			return fail(400, {
				email,
				next,
				message: 'Enter the email and password.'
			});
		}

		try {
			const signIn = await signInWithEmailPassword({
				email,
				password,
				platformEnv: platform?.env
			});
			const env = getRuntimeEnv(platform?.env);
			const token = await verifyFirebaseIdToken(signIn.idToken, env);
			const sessionEmail = (token.email ?? signIn.email ?? email).toLowerCase();
			const session = createAuthSession({
				uid: signIn.localId,
				email: sessionEmail,
				name: token.name ?? signIn.displayName ?? null,
				photoUrl: token.picture ?? null,
				idToken: signIn.idToken,
				refreshToken: signIn.refreshToken,
				expiresInSeconds: signIn.expiresIn
			});

			clearAuthSessionIdCookie(cookies);
			clearAuthSessionCookie(cookies);
			await setAuthSessionCookie(cookies, session, env.authCookieSecret);
		} catch (error) {
			console.warn('Email sign-in failed.', error);
			return fail(400, {
				email,
				next,
				message: 'That email and password did not sign in.'
			});
		}

		throw redirect(303, next);
	}
};
