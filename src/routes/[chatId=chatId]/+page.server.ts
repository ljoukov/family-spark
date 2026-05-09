import { error } from '@sveltejs/kit';
import { readChatSnapshot } from '$lib/server/chat-do-client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, platform }) => {
	if (!locals.user) {
		throw error(401, 'Sign in before chatting.');
	}

	const snapshot = await readChatSnapshot(platform?.env, locals.user.uid, params.chatId);
	return {
		chatId: params.chatId,
		chat: snapshot.chat,
		activeRun: snapshot.activeRun,
		chatModel: snapshot.chatModel,
		thinkingLevel: snapshot.thinkingLevel
	};
};
