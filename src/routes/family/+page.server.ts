import { fail, redirect } from '@sveltejs/kit';
import {
	createFamilyChild,
	inviteFamilyAdult,
	updateFamilyChild
} from '$lib/server/family-do-client';
import { loadFamilySessionForUser } from '$lib/server/family-session';
import type { LearnerRegion } from '$lib/family-types';
import type { Actions, PageServerLoad } from './$types';

function stringValue(data: FormData, key: string): string {
	return String(data.get(key) ?? '').trim();
}

function nullableEmail(data: FormData, key: string): string | null {
	const value = stringValue(data, key).toLowerCase();
	return value.length > 0 ? value : null;
}

function optionalString(data: FormData, key: string): string | null {
	const value = stringValue(data, key);
	return value.length > 0 ? value : null;
}

function numberValue(data: FormData, key: string): number | null {
	const raw = stringValue(data, key);
	if (!raw) {
		return null;
	}
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) ? parsed : null;
}

function regionValue(data: FormData): LearnerRegion {
	const region = stringValue(data, 'region');
	return region === 'UK' || region === 'US' || region === 'EU' || region === 'other'
		? region
		: 'other';
}

export const load: PageServerLoad = async ({ locals, platform }) => {
	if (!locals.user) {
		throw redirect(303, '/auth/login?next=/family');
	}

	const session = await loadFamilySessionForUser(platform?.env, locals.user);
	return {
		family: session.family,
		viewer: session.viewer,
		user: locals.user
	};
};

export const actions: Actions = {
	createChild: async ({ request, locals, platform }) => {
		if (!locals.user) {
			throw redirect(303, '/auth/login?next=/family');
		}
		const data = await request.formData();
		const displayName = stringValue(data, 'displayName');
		const age = numberValue(data, 'age');
		const pin = stringValue(data, 'pin');
		const loginEmail = nullableEmail(data, 'loginEmail');
		if (!displayName || !age || !pin) {
			return fail(400, { message: 'Enter a learner name, age, and PIN.' });
		}

		try {
			await createFamilyChild(platform?.env, locals.user, {
				displayName,
				age,
				avatarId: optionalString(data, 'avatarId') ?? 'spark',
				yearGroup: optionalString(data, 'yearGroup'),
				region: regionValue(data),
				loginMode: stringValue(data, 'loginMode') as
					| 'profile_pin_on_approved_device'
					| 'family_code_plus_pin'
					| 'guardian_qr_approval'
					| 'teen_passkey'
					| 'teen_username_password',
				pin,
				loginEmail
			});
		} catch (error) {
			return fail(400, {
				message: error instanceof Error ? error.message : 'Could not create child profile.'
			});
		}
		throw redirect(303, '/family');
	},
	inviteAdult: async ({ request, locals, platform }) => {
		if (!locals.user) {
			throw redirect(303, '/auth/login?next=/family');
		}
		const data = await request.formData();
		const email = nullableEmail(data, 'email');
		if (!email) {
			return fail(400, { message: 'Enter an adult email.' });
		}

		try {
			await inviteFamilyAdult(platform?.env, locals.user, { email });
		} catch (error) {
			return fail(400, {
				message: error instanceof Error ? error.message : 'Could not invite adult.'
			});
		}
		throw redirect(303, '/family');
	},
	updateChild: async ({ request, locals, platform }) => {
		if (!locals.user) {
			throw redirect(303, '/auth/login?next=/family');
		}
		const data = await request.formData();
		const childId = stringValue(data, 'childId');
		const displayName = stringValue(data, 'displayName');
		const age = numberValue(data, 'age');
		if (!childId || !displayName || !age) {
			return fail(400, { message: 'Child name and age are required.' });
		}

		try {
			await updateFamilyChild(platform?.env, locals.user, {
				childId,
				displayName,
				age,
				avatarId: optionalString(data, 'avatarId') ?? 'spark',
				yearGroup: optionalString(data, 'yearGroup'),
				region: regionValue(data),
				loginMode: stringValue(data, 'loginMode') as
					| 'profile_pin_on_approved_device'
					| 'family_code_plus_pin'
					| 'guardian_qr_approval'
					| 'teen_passkey'
					| 'teen_username_password',
				pin: optionalString(data, 'pin'),
				loginEmail: nullableEmail(data, 'loginEmail'),
				supervisionLevel: stringValue(data, 'supervisionLevel') as
					| 'strict'
					| 'guided'
					| 'balanced'
					| 'light'
					| 'none',
				homeworkAnswerPolicy: stringValue(data, 'homeworkAnswerPolicy') as
					| 'no_direct_answers'
					| 'hints_first'
					| 'exam_practice_allowed',
				freeChatAllowed: data.get('freeChatAllowed') === 'on',
				webAccessAllowed: data.get('webAccessAllowed') === 'on',
				imageGenerationAllowed: data.get('imageGenerationAllowed') === 'on',
				voiceAllowed: data.get('voiceAllowed') === 'on',
				memoryAllowed: data.get('memoryAllowed') === 'on',
				sessionTimeLimitMinutes: numberValue(data, 'sessionTimeLimitMinutes'),
				parentCanViewFullChats: data.get('parentCanViewFullChats') === 'on',
				parentCanViewLearningSummary: data.get('parentCanViewLearningSummary') === 'on',
				parentCanViewSafetyAlerts: data.get('parentCanViewSafetyAlerts') === 'on',
				personalisedMemory: data.get('personalisedMemory') === 'on',
				quietHoursEnabled: data.get('quietHoursEnabled') === 'on',
				quietHoursStart: stringValue(data, 'quietHoursStart') || '21:00',
				quietHoursEnd: stringValue(data, 'quietHoursEnd') || '07:00'
			});
		} catch (error) {
			return fail(400, {
				message: error instanceof Error ? error.message : 'Could not update child profile.'
			});
		}
		throw redirect(303, '/family');
	}
};
