import { isChatId } from '$lib/chat-ids';

export function match(param: string): boolean {
	return isChatId(param);
}
