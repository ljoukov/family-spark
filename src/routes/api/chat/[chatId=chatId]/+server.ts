import { json, type RequestHandler } from '@sveltejs/kit';
import { fetchChatRoom } from '$lib/server/chat-do-client';

export const POST: RequestHandler = async ({ request, locals, params, platform }) => {
	if (!locals.user) {
		return json({ error: 'signed_out', message: 'Sign in before chatting.' }, { status: 401 });
	}
	if (!params.chatId) {
		return json({ error: 'invalid_chat_id', message: 'Invalid chat id.' }, { status: 400 });
	}

	const body = await request.text();
	const response = await fetchChatRoom({
		platformEnv: platform?.env,
		userId: locals.user.uid,
		chatId: params.chatId,
		path: '/message',
		method: 'POST',
		headers: {
			'content-type': request.headers.get('content-type') ?? 'application/json'
		},
		body
	});

	if (!response) {
		return json(
			{ error: 'chat_storage_unavailable', message: 'Chat storage is unavailable.' },
			{ status: 503 }
		);
	}
	return response;
};
