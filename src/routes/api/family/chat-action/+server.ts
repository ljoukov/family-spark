import { json, type RequestHandler } from '@sveltejs/kit';
import { chatActionCardSchema } from '$lib/family-types';
import { createFamilyChild, inviteFamilyAdult } from '$lib/server/family-do-client';
import { loadFamilySessionForUser } from '$lib/server/family-session';
import { z } from 'zod';

const actionRequestSchema = z
	.object({
		action: z.enum(['confirm', 'cancel']),
		card: chatActionCardSchema
	})
	.strict();

function stringPayload(card: z.infer<typeof chatActionCardSchema>, key: string): string {
	const value = card.payload[key];
	return typeof value === 'string' ? value.trim() : '';
}

function numberPayload(card: z.infer<typeof chatActionCardSchema>, key: string): number | null {
	const value = card.payload[key];
	if (typeof value === 'number') {
		return value;
	}
	if (typeof value === 'string') {
		const parsed = Number.parseInt(value, 10);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

export const POST: RequestHandler = async ({ request, locals, platform }) => {
	if (!locals.user) {
		return json(
			{ error: 'signed_out', message: 'Sign in before changing family settings.' },
			{ status: 401 }
		);
	}

	let body: z.infer<typeof actionRequestSchema>;
	try {
		body = actionRequestSchema.parse(await request.json());
	} catch {
		return json({ error: 'invalid_json', message: 'Request body must be JSON.' }, { status: 400 });
	}

	if (body.action === 'cancel') {
		return json({ ok: true, status: 'cancelled', message: 'Cancelled.' });
	}

	const session = await loadFamilySessionForUser(platform?.env, locals.user);
	if (session.viewer.role !== 'adult') {
		return json(
			{ error: 'forbidden', message: 'Only an adult guardian can confirm this action.' },
			{ status: 403 }
		);
	}

	try {
		if (body.card.kind === 'create_child') {
			const displayName = stringPayload(body.card, 'displayName');
			const age = numberPayload(body.card, 'age');
			const pin = stringPayload(body.card, 'pin');
			const loginEmail = stringPayload(body.card, 'loginEmail') || null;
			if (!displayName || !age || !pin) {
				throw new Error('Child name, age, and PIN are required.');
			}
			await createFamilyChild(platform?.env, locals.user, {
				displayName,
				age,
				region: 'US',
				pin,
				loginEmail
			});
			return json({
				ok: true,
				status: 'confirmed',
				message: `${displayName} was added to the family.`
			});
		}

		if (body.card.kind === 'invite_adult') {
			const email = stringPayload(body.card, 'email');
			if (!email) {
				throw new Error('Adult email is required.');
			}
			await inviteFamilyAdult(platform?.env, locals.user, { email });
			return json({
				ok: true,
				status: 'confirmed',
				message: `${email} can join this family by signing in with that email.`
			});
		}

		return json({ ok: true, status: 'done', message: 'Open the parent dashboard.' });
	} catch (error) {
		return json(
			{
				error: 'family_action_failed',
				message: error instanceof Error ? error.message : 'Family action failed.'
			},
			{ status: 400 }
		);
	}
};
