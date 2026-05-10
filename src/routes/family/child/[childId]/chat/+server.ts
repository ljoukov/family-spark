import { redirect, type RequestHandler } from '@sveltejs/kit';
import { createChatId } from '$lib/chat-ids';

export const GET: RequestHandler = async ({ params }) => {
	throw redirect(303, `/${createChatId()}?child=${encodeURIComponent(params.childId ?? '')}`);
};
