import { chatActionCardSchema, normalizeEmail, type ChatActionCard } from '$lib/family-types';
import type { FamilySession } from '$lib/family-types';

function createId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanName(value: string): string {
	return value
		.replace(/\b(age|aged|years old|year old|yo)\b.*$/iu, '')
		.replace(/\b(1[0-9]|[3-9])\b.*$/u, '')
		.replace(/[,.]/gu, ' ')
		.replace(/\s+/gu, ' ')
		.trim();
}

function extractEmail(text: string): string | null {
	const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
	return match ? normalizeEmail(match[0]) : null;
}

function createChildCard(text: string): ChatActionCard | null {
	const lower = text.toLowerCase();
	if (
		!/\b(add|create|make|set up)\b/u.test(lower) ||
		!/\b(child|kid|daughter|son)\b/u.test(lower)
	) {
		return null;
	}

	const ageMatch = text.match(/\b(?:age|aged)?\s*(1[0-9]|[3-9])\b/iu);
	if (!ageMatch) {
		return chatActionCardSchema.parse({
			id: createId(),
			kind: 'open_dashboard',
			title: 'Add a child profile',
			body: 'I can do that from chat, but I need the child name and age first. You can also add the profile in the parent dashboard.',
			status: 'done',
			payload: { href: '/family' }
		});
	}

	const age = Number.parseInt(ageMatch[1], 10);
	const nameMatch = text.match(
		/\b(?:child|kid|daughter|son)(?:\s+(?:called|named))?\s+([A-Za-z][A-Za-z' -]{1,60})/iu
	);
	const displayName = cleanName(nameMatch?.[1] ?? '');
	if (!displayName) {
		return null;
	}
	const pinMatch = text.match(/\bpin\s*[:#-]?\s*(\d{4,6})\b/iu);
	if (!pinMatch) {
		return chatActionCardSchema.parse({
			id: createId(),
			kind: 'open_dashboard',
			title: `Finish ${displayName}'s learner profile`,
			body: `I found ${displayName}, age ${age}. A learner profile also needs a parent-set PIN, so finish this in the parent dashboard or say it with a PIN, for example: add child ${displayName} age ${age} PIN 4821.`,
			status: 'done',
			payload: { href: '/family' }
		});
	}

	return chatActionCardSchema.parse({
		id: createId(),
		kind: 'create_child',
		title: `Add ${displayName} to the family`,
		body: `Create a child profile for ${displayName}, age ${age}. This lets adults manage age-aware settings and lets ${displayName} use FamilySpark with child-safe guidance.`,
		confirmLabel: 'Create child',
		cancelLabel: 'Cancel',
		payload: {
			displayName,
			age,
			pin: pinMatch[1],
			loginEmail: extractEmail(text)
		}
	});
}

function inviteAdultCard(text: string): ChatActionCard | null {
	const lower = text.toLowerCase();
	if (!/\b(invite|add|share|make)\b/u.test(lower) || !/\b(adult|guardian|parent)\b/u.test(lower)) {
		return null;
	}
	const email = extractEmail(text);
	if (!email) {
		return chatActionCardSchema.parse({
			id: createId(),
			kind: 'open_dashboard',
			title: 'Invite another adult',
			body: 'I need the adult email before I can prepare the confirmation. You can also invite a guardian from the parent dashboard.',
			status: 'done',
			payload: { href: '/family' }
		});
	}

	return chatActionCardSchema.parse({
		id: createId(),
		kind: 'invite_adult',
		title: `Invite ${email}`,
		body: `${email} will be able to manage the same children after signing in with that email. Confirm before adding another adult to the family account.`,
		confirmLabel: 'Invite adult',
		cancelLabel: 'Cancel',
		payload: { email }
	});
}

function dashboardCard(text: string): ChatActionCard | null {
	if (!/\b(parent|family|dashboard|settings|manage)\b/iu.test(text)) {
		return null;
	}
	return chatActionCardSchema.parse({
		id: createId(),
		kind: 'open_dashboard',
		title: 'Open parent dashboard',
		body: 'Use the dashboard for child profiles, guardian access, safe homework modes, quiet hours, and child login emails.',
		status: 'done',
		payload: { href: '/family' }
	});
}

export function createFamilyChatActionCard({
	text,
	session
}: {
	text: string;
	session: FamilySession;
}): ChatActionCard | null {
	if (session.viewer.role !== 'adult') {
		return null;
	}
	return createChildCard(text) ?? inviteAdultCard(text) ?? dashboardCard(text);
}
