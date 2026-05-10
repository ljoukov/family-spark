import { json, type RequestHandler } from '@sveltejs/kit';
import { fetchChatRoom, mutableChatResponse } from '$lib/server/chat-do-client';
import { createFamilyChatActionCard } from '$lib/server/family-chat-actions';
import {
	createFamilyChatInstructions,
	loadFamilySessionForUser,
	resolveFamilyChatActor
} from '$lib/server/family-session';
import { z } from 'zod';

const chatPostBodySchema = z
	.object({
		text: z.string(),
		activeChildId: z.string().nullable().optional()
	})
	.strict();

export const POST: RequestHandler = async ({ request, locals, params, platform }) => {
	if (!locals.user) {
		return json({ error: 'signed_out', message: 'Sign in before chatting.' }, { status: 401 });
	}
	if (!params.chatId) {
		return json({ error: 'invalid_chat_id', message: 'Invalid chat id.' }, { status: 400 });
	}

	let body: z.infer<typeof chatPostBodySchema>;
	try {
		body = chatPostBodySchema.parse(await request.json());
	} catch {
		return json({ error: 'invalid_json', message: 'Request body must be JSON.' }, { status: 400 });
	}

	const familySession = await loadFamilySessionForUser(platform?.env, locals.user);
	const actor = resolveFamilyChatActor({
		session: familySession,
		user: locals.user,
		requestedChildId: body.activeChildId ?? null
	});
	const card = createFamilyChatActionCard({ text: body.text, session: familySession });
	const chatBody = {
		text: body.text,
		contextInstructions: createFamilyChatInstructions({ session: familySession, actor }),
		...(card
			? {
					assistantText:
						card.kind === 'open_dashboard'
							? 'Here is the parent dashboard entry point.'
							: 'I can prepare that family account change. Please confirm it first.',
					cards: [card]
				}
			: {})
	};
	const response = await fetchChatRoom({
		platformEnv: platform?.env,
		userId: actor.ownerId,
		chatId: params.chatId,
		path: '/message',
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(chatBody)
	});

	if (!response) {
		return json(
			{ error: 'chat_storage_unavailable', message: 'Chat storage is unavailable.' },
			{ status: 503 }
		);
	}
	return mutableChatResponse(response);
};
