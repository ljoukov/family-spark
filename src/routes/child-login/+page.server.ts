import { getRuntimeEnv } from '$lib/server/env';
import { loginFamilyLearnerWithPin } from '$lib/server/family-do-client';
import { clearAuthSessionCookie, setLearnerSessionCookie } from '$lib/server/auth/session';
import { dev } from '$app/environment';
import { fail, redirect } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DEVICE_COOKIE_NAME = 'familySparkLearnerDevice';
const LEARNER_SESSION_DAYS = 30;

function safeNext(value: string | null): string {
	if (!value || !value.startsWith('/') || value.startsWith('//')) {
		return '/';
	}
	return value;
}

function getOrCreateDeviceId(cookies: Cookies): string {
	const existing = cookies.get(DEVICE_COOKIE_NAME);
	if (existing) {
		return existing;
	}
	const deviceId = crypto.randomUUID();
	cookies.set(DEVICE_COOKIE_NAME, deviceId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: dev ? false : true,
		maxAge: 365 * 24 * 60 * 60
	});
	return deviceId;
}

export const load: PageServerLoad = async ({ url }) => {
	return {
		next: safeNext(url.searchParams.get('next'))
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, platform }) => {
		const data = await request.formData();
		const familyCode = String(data.get('familyCode') ?? '').trim();
		const displayName = String(data.get('displayName') ?? '').trim();
		const pin = String(data.get('pin') ?? '').trim();
		const next = safeNext(String(data.get('next') ?? '/'));
		if (!familyCode || !displayName || !pin) {
			return fail(400, {
				familyCode,
				displayName,
				next,
				message: 'Enter the family code, profile name, and PIN.'
			});
		}

		try {
			const deviceId = getOrCreateDeviceId(cookies);
			const session = await loginFamilyLearnerWithPin(platform?.env, {
				familyCode,
				displayName,
				pin,
				deviceId
			});
			const child = session.family.children.find((item) => item.id === session.viewer.childId);
			if (!child) {
				throw new Error('Learner profile was not found.');
			}
			const env = getRuntimeEnv(platform?.env);
			clearAuthSessionCookie(cookies);
			await setLearnerSessionCookie(
				cookies,
				{
					familyId: session.family.id,
					childId: child.id,
					displayName: child.displayName,
					deviceId,
					expiresAtMs: Date.now() + LEARNER_SESSION_DAYS * 24 * 60 * 60 * 1000
				},
				env.authCookieSecret
			);
		} catch (error) {
			return fail(400, {
				familyCode,
				displayName,
				next,
				message: error instanceof Error ? error.message : 'Learner login failed.'
			});
		}

		throw redirect(303, next);
	}
};
