import type { FamilyAccount, FamilyChild, FamilySession } from '$lib/family-types';
import type { AuthUser } from './auth/session';
import { ensureFamilySession } from './family-do-client';

export type FamilyChatActor =
	| {
			mode: 'adult';
			ownerId: string;
			activeChild: null;
	  }
	| {
			mode: 'child';
			ownerId: string;
			activeChild: FamilyChild;
	  };

export type FamilyPageContext = {
	family: FamilyAccount;
	viewerRole: FamilySession['viewer']['role'];
	activeChild: FamilyChild | null;
	canManageFamily: boolean;
};

export async function loadFamilySessionForUser(
	platformEnv: unknown,
	user: AuthUser
): Promise<FamilySession> {
	return await ensureFamilySession(platformEnv, user);
}

export function getFamilyChild(family: FamilyAccount, childId: string | null): FamilyChild | null {
	if (!childId) {
		return null;
	}
	return family.children.find((child) => child.id === childId) ?? null;
}

export function resolveFamilyChatActor({
	session,
	user,
	requestedChildId
}: {
	session: FamilySession;
	user: AuthUser;
	requestedChildId?: string | null;
}): FamilyChatActor {
	const family = session.family;
	if (session.viewer.role === 'child') {
		const child = getFamilyChild(family, session.viewer.childId);
		if (!child) {
			throw new Error('Child profile was not found.');
		}
		return {
			mode: 'child',
			activeChild: child,
			ownerId: `family:${family.id}:child:${child.id}`
		};
	}

	const activeChild = getFamilyChild(family, requestedChildId ?? null);
	if (activeChild) {
		return {
			mode: 'child',
			activeChild,
			ownerId: `family:${family.id}:child:${activeChild.id}`
		};
	}

	return {
		mode: 'adult',
		activeChild: null,
		ownerId: user.uid
	};
}

export function createFamilyPageContext(
	session: FamilySession,
	actor: FamilyChatActor
): FamilyPageContext {
	return {
		family: session.family,
		viewerRole: session.viewer.role,
		activeChild: actor.activeChild,
		canManageFamily: session.viewer.role === 'adult'
	};
}

export function createFamilyChatInstructions({
	session,
	actor
}: {
	session: FamilySession;
	actor: FamilyChatActor;
}): string {
	const family = session.family;
	const children = family.children
		.map((child) => {
			const login = child.loginEmail ? `, optional login ${child.loginEmail}` : '';
			return `${child.displayName}, age ${child.age}, ${child.ageBand}, supervision ${child.supervision.level}${login}`;
		})
		.join('; ');

	if (actor.mode === 'child') {
		const child = actor.activeChild;
		return [
			`Current FamilySpark context: you are speaking with ${child.displayName}, age ${child.age}.`,
			`Learner account mode: ${child.ageBand}. Supervision level: ${child.supervision.level}. Homework answer policy: ${child.supervision.homeworkAnswerPolicy}.`,
			child.supervision.freeChatAllowed
				? 'The learner may use chat more freely, but keep answers guided and age-appropriate.'
				: 'Keep the experience structured and guided. Do not behave like an open-ended general chatbot.',
			child.privacy.parentCanViewFullChats
				? 'This learner account is configured so parents may view full chats; be transparent if the learner asks what is shared.'
				: 'Parents receive summaries and serious safety alerts, not full chat transcripts by default.',
			'Do not present yourself as a therapist or a parent. For distress, bullying, self-harm, adult content, unsafe requests, or emotionally dependent conversation, slow down and encourage help from a trusted adult.',
			'For homework, give hints, check reasoning, and ask the learner to write the next step before giving a complete answer.'
		].join('\n');
	}

	return [
		`Current FamilySpark context: you are speaking with an adult guardian in ${family.name}.`,
		children ? `Children in this family: ${children}.` : 'No child profiles have been added yet.',
		'The adult can manage learner profiles, child login emails, family guardians, supervision policies, privacy settings, and boundaries from the parent dashboard.',
		'Important account-management changes must not be treated as done from chat text alone. If the user asks to add a child, link a child login, invite another adult, or change safety settings, ask for or rely on an explicit confirmation card.',
		'Parent-facing summaries should focus on learning signals, misconceptions, confidence, effort, and next suggested activity rather than raw surveillance.'
	].join('\n');
}
