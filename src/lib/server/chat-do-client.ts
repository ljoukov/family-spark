import type { DurableObjectNamespace, DurableObjectStub } from '@cloudflare/workers-types';
import { env as privateEnv } from '$env/dynamic/private';
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
	FAMILY_SPARK_DO_GATEWAY_ORIGIN?: string;
	FAMILY_SPARK_DO_GATEWAY_TOKEN?: string;
};

const CHAT_ROOMS_GATEWAY_NAMESPACE = 'family-spark-chat-rooms';

function getChatNamespace(platformEnv?: unknown): DurableObjectNamespace | null {
	if (!platformEnv || typeof platformEnv !== 'object') {
		return null;
	}
	return (platformEnv as ChatPlatformEnv).CHAT_ROOMS ?? null;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	const headers = new Headers(init?.headers);
	headers.set('content-type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(body), { ...init, headers });
}

export function mutableChatResponse(response: Response): Response {
	const webSocket = (response as Response & { webSocket?: WebSocket }).webSocket;
	const init = {
		status: response.status,
		statusText: response.statusText,
		headers: new Headers(response.headers),
		...(webSocket ? { webSocket } : {})
	} as ResponseInit & { webSocket?: WebSocket };
	return new Response(response.body, init);
}

function readStringEnv(platformEnv: unknown, key: keyof ChatPlatformEnv): string | null {
	if (platformEnv && typeof platformEnv === 'object') {
		const value = (platformEnv as ChatPlatformEnv)[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			return value.trim();
		}
	}

	const value = privateEnv[key];
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

async function createProxyBody(request?: Request, body?: string | null): Promise<string> {
	if (typeof body === 'string') {
		return body;
	}
	if (!request || request.method === 'GET' || request.method === 'HEAD') {
		return '';
	}
	return await request.text();
}

function remoteProxyError(error: unknown): Response {
	console.error('Remote chat Durable Object proxy failed.', error);
	return jsonResponse(
		{
			error: 'remote_chat_unavailable',
			message: 'Remote chat is unavailable. Try again after the local server reconnects.'
		},
		{ status: 503 }
	);
}

export function hasChatRoomBinding(platformEnv: unknown): boolean {
	return Boolean(getChatNamespace(platformEnv));
}

async function fetchRemoteChatRoom({
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
}): Promise<Response> {
	const origin = readStringEnv(platformEnv, 'FAMILY_SPARK_DO_GATEWAY_ORIGIN')?.replace(/\/+$/u, '');
	const token = readStringEnv(platformEnv, 'FAMILY_SPARK_DO_GATEWAY_TOKEN');
	if (!origin || !token) {
		return remoteProxyError(new Error('Durable Objects gateway is not configured.'));
	}

	const requestMethod = method ?? request?.method ?? 'GET';
	const requestBody = await createProxyBody(request, body);
	const requestHeaders = new Headers(headers);
	const contentType = request?.headers.get('content-type') ?? requestHeaders.get('content-type');
	const accept = request?.headers.get('accept') ?? requestHeaders.get('accept');
	requestHeaders.set('authorization', `Bearer ${token}`);
	requestHeaders.set(CHAT_USER_ID_HEADER, userId);
	requestHeaders.set(CHAT_ID_HEADER, chatId);
	if (contentType) {
		requestHeaders.set('content-type', contentType);
	}
	if (accept) {
		requestHeaders.set('accept', accept);
	}

	const objectName = `${userId}:${chatId}`;
	const gatewayUrl = new URL(
		`/v1/namespaces/${encodeURIComponent(CHAT_ROOMS_GATEWAY_NAMESPACE)}/objects/${encodeURIComponent(
			objectName
		)}${path}`,
		`${origin}/`
	);
	if (request) {
		gatewayUrl.search = new URL(request.url).search;
	}

	try {
		return await fetch(gatewayUrl, {
			method: requestMethod,
			headers: requestHeaders,
			body: requestMethod === 'GET' || requestMethod === 'HEAD' ? undefined : requestBody,
			redirect: 'manual'
		});
	} catch (error) {
		return remoteProxyError(error);
	}
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
		if (!isChatId(chatId)) {
			return null;
		}
		return await fetchRemoteChatRoom({
			platformEnv,
			userId,
			chatId,
			path,
			request,
			method,
			headers,
			body
		});
	}

	const requestHeaders = new Headers(request?.headers);
	if (headers) {
		new Headers(headers).forEach((value, key) => {
			requestHeaders.set(key, value);
		});
	}
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
