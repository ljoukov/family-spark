import { json, type RequestHandler } from '@sveltejs/kit';
import { fetchChatRoom, mutableChatResponse } from '$lib/server/chat-do-client';
import { loadFamilySessionForUser, resolveFamilyChatActor } from '$lib/server/family-session';

export const POST: RequestHandler = async ({ request, locals, params, platform, url }) => {
	if (!locals.user) {
		return json({ error: 'signed_out', message: 'Sign in before chatting.' }, { status: 401 });
	}
	if (!params.chatId) {
		return json({ error: 'invalid_chat_id', message: 'Invalid chat id.' }, { status: 400 });
	}

	const familySession = await loadFamilySessionForUser(platform?.env, locals.user);
	const actor = resolveFamilyChatActor({
		session: familySession,
		user: locals.user,
		requestedChildId: url.searchParams.get('child')
	});
	const response = await fetchChatRoom({
		platformEnv: platform?.env,
		userId: actor.ownerId,
		chatId: params.chatId,
		path: '/stop',
		request,
		method: 'POST'
	});

	if (!response) {
		return json(
			{ error: 'chat_storage_unavailable', message: 'Chat storage is unavailable.' },
			{ status: 503 }
		);
	}
	return mutableChatResponse(response);
};
