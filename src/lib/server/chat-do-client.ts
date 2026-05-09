import type { DurableObjectNamespace, DurableObjectStub } from '@cloudflare/workers-types';
import { isChatId } from '$lib/chat-ids';
import {
	CHAT_ID_HEADER,
	CHAT_USER_ID_HEADER,
	chatSnapshotFromState,
	createEmptyChatState,
	type ChatSnapshot
} from './chat-types';

type ChatPlatformEnv = Record<string, unknown> & {
	CHAT_ROOMS?: DurableObjectNamespace;
};

function getChatNamespace(platformEnv?: unknown): DurableObjectNamespace | null {
	if (!platformEnv || typeof platformEnv !== 'object') {
		return null;
	}
	return (platformEnv as ChatPlatformEnv).CHAT_ROOMS ?? null;
}

export function getChatRoomStub(
	platformEnv: unknown,
	userId: string,
	chatId: string
): DurableObjectStub | null {
	const namespace = getChatNamespace(platformEnv);
	if (!namespace || !isChatId(chatId)) {
		return null;
	}
	return namespace.get(namespace.idFromName(`${userId}:${chatId}`));
}

export async function fetchChatRoom({
	platformEnv,
	userId,
	chatId,
	path,
	request,
	method,
	headers,
	body
}: {
	platformEnv: unknown;
	userId: string;
	chatId: string;
	path: string;
	request?: Request;
	method?: string;
	headers?: HeadersInit;
	body?: string | null;
}): Promise<Response | null> {
	const stub = getChatRoomStub(platformEnv, userId, chatId);
	if (!stub) {
		return null;
	}

	const requestHeaders = new Headers(request?.headers ?? headers);
	requestHeaders.set(CHAT_USER_ID_HEADER, userId);
	requestHeaders.set(CHAT_ID_HEADER, chatId);

	const internalUrl = new URL(path, 'https://family-spark-chat.internal/').toString();
	const init = request
		? {
				method: request.method,
				headers: requestHeaders,
				redirect: 'manual' as const
			}
		: {
				method: method ?? 'GET',
				headers: requestHeaders,
				body: body ?? undefined,
				redirect: 'manual' as const
			};

	return (await stub.fetch(internalUrl, init)) as unknown as Response;
}

export async function readChatSnapshot(
	platformEnv: unknown,
	userId: string,
	chatId: string
): Promise<ChatSnapshot> {
	const response = await fetchChatRoom({
		platformEnv,
		userId,
		chatId,
		path: '/state'
	});
	if (!response) {
		return chatSnapshotFromState(createEmptyChatState(chatId), platformEnv);
	}
	if (!response.ok) {
		throw new Error(`Chat room state request failed with status ${response.status}`);
	}
	return (await response.json()) as ChatSnapshot;
}
