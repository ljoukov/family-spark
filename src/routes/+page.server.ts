import { redirect } from '@sveltejs/kit';
import { createChatId } from '$lib/chat-ids';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	throw redirect(307, `/${createChatId()}`);
};
