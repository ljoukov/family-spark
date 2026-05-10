import { error } from '@sveltejs/kit';
import { readChatSnapshot } from '$lib/server/chat-do-client';
import {
	createFamilyPageContext,
	loadFamilySessionForUser,
	resolveFamilyChatActor
} from '$lib/server/family-session';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, platform, url }) => {
	if (!locals.user) {
		throw error(401, 'Sign in before chatting.');
	}

	const familySession = await loadFamilySessionForUser(platform?.env, locals.user);
	const actor = resolveFamilyChatActor({
		session: familySession,
		user: locals.user,
		requestedChildId: url.searchParams.get('child')
	});
	const snapshot = await readChatSnapshot(platform?.env, actor.ownerId, params.chatId);
	return {
		chatId: params.chatId,
		chat: snapshot.chat,
		activeRun: snapshot.activeRun,
		chatModel: snapshot.chatModel,
		thinkingLevel: snapshot.thinkingLevel,
		familyContext: createFamilyPageContext(familySession, actor)
	};
};
