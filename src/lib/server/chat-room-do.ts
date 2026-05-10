import { DurableObject } from 'cloudflare:workers';
import { streamText, type LlmInputMessage, type LlmUsageTokens } from '@ljoukov/llm';
import { z } from 'zod';
import { isChatId } from '../chat-ids';
import { chatActionCardSchema } from '$lib/family-types';
import {
	CHAT_ID_HEADER,
	CHAT_USER_ID_HEADER,
	MAX_HISTORY_MESSAGES,
	MAX_MESSAGE_CHARS,
	SYSTEM_PROMPT,
	chatSnapshotFromState,
	cloneChatState,
	createEmptyChatState,
	createStoredMessage,
	durableChatStateSchema,
	titleFromMessage,
	type ActiveChatRun,
	type ChatRealtimeEvent,
	type DurableChatState,
	type StoredChatMessage
} from './chat-types';
import { CHAT_THINKING_LEVEL, resolveChatModel } from './chat-model';

const STORAGE_KEY = 'chat-state';
const STORAGE_WRITE_INTERVAL_MS = 4_000;
const textEncoder = new TextEncoder();

const LLM_ENV_KEYS = ['OPENAI_API_KEY'] as const;

const postMessageBodySchema = z
	.object({
		text: z.string(),
		contextInstructions: z.string().optional(),
		assistantText: z.string().optional(),
		cards: z.array(chatActionCardSchema).optional()
	})
	.strict();

type ChatRoomEnv = Record<string, unknown>;

type SseClient = {
	id: string;
	controller: ReadableStreamDefaultController<Uint8Array>;
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	const headers = new Headers(init?.headers);
	headers.set('content-type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(body), { ...init, headers });
}

function serializeError(error: unknown): string {
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return 'The chat request failed.';
}

function errorForLog(error: unknown): Record<string, unknown> {
	if (error instanceof Error) {
		return {
			name: error.name,
			message: error.message,
			stack: error.stack
		};
	}
	return {
		message: String(error)
	};
}

function installLlmProcessEnv(platformEnv: ChatRoomEnv): void {
	const processEnv = (
		globalThis as typeof globalThis & {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
	if (!processEnv) {
		return;
	}

	for (const key of LLM_ENV_KEYS) {
		const value = platformEnv[key];
		if (typeof value === 'string' && value.trim().length > 0) {
			processEnv[key] = value;
		}
	}
}

function createRunId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getMessage(state: DurableChatState, messageId: string): StoredChatMessage | null {
	return state.chat.messages.find((message) => message.id === messageId) ?? null;
}

function createSsePayload(event: ChatRealtimeEvent): Uint8Array {
	return textEncoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export class ChatRoomDurableObject extends DurableObject<ChatRoomEnv> {
	private state: DurableChatState | null = null;
	private readonly ready: Promise<void>;
	private readonly sseClients = new Map<string, SseClient>();
	private dirty = false;
	private recoveredDirty = false;
	private lastStorageWriteAt = 0;
	private persistTimer: ReturnType<typeof setTimeout> | null = null;
	private persistPromise: Promise<void> | null = null;
	private activeAbortController: AbortController | null = null;
	private stoppingRunId: string | null = null;

	constructor(ctx: DurableObjectState, env: ChatRoomEnv) {
		super(ctx, env);
		this.ready = this.ctx.blockConcurrencyWhile(() => this.loadState());
	}

	private async loadState(): Promise<void> {
		const stored = await this.ctx.storage.get(STORAGE_KEY);
		if (stored) {
			const parsed = durableChatStateSchema.safeParse(stored);
			if (!parsed.success) {
				console.error('Stored chat state could not be parsed.', {
					issues: parsed.error.issues.map((issue) => ({
						path: issue.path.join('.'),
						code: issue.code,
						message: issue.message
					}))
				});
				try {
					await this.ctx.storage.put(`${STORAGE_KEY}:invalid:${Date.now()}`, stored);
					await this.ctx.storage.delete(STORAGE_KEY);
				} catch (error) {
					console.error('Invalid chat state could not be moved aside.', errorForLog(error));
				}
				return;
			}
			this.state = parsed.data;
			if (this.state.activeRun) {
				this.recoverInterruptedRun(this.state);
			}
		}
	}

	private recoverInterruptedRun(state: DurableChatState): void {
		const activeRun = state.activeRun;
		if (!activeRun) {
			return;
		}
		const assistant = getMessage(state, activeRun.assistantMessageId);
		if (assistant && assistant.status === 'streaming') {
			assistant.status = 'error';
			assistant.text = assistant.text || 'The previous response was interrupted.';
		}
		state.activeRun = null;
		state.chat.updatedAt = Date.now();
		this.recoveredDirty = true;
	}

	private async getState(request: Request): Promise<DurableChatState> {
		await this.ready;
		if (this.state) {
			if (this.recoveredDirty) {
				this.recoveredDirty = false;
				this.markDirty();
			}
			return this.state;
		}

		const chatId = request.headers.get(CHAT_ID_HEADER);
		if (!isChatId(chatId)) {
			throw new Error('Invalid chat id.');
		}
		this.state = createEmptyChatState(chatId);
		this.markDirty();
		return this.state;
	}

	private requireUser(request: Request): Response | null {
		const userId = request.headers.get(CHAT_USER_ID_HEADER);
		if (!userId || userId.trim().length === 0) {
			return jsonResponse(
				{ error: 'signed_out', message: 'Sign in before chatting.' },
				{ status: 401 }
			);
		}
		return null;
	}

	private sendToSseClient(client: SseClient, event: ChatRealtimeEvent): void {
		try {
			client.controller.enqueue(createSsePayload(event));
		} catch {
			this.sseClients.delete(client.id);
		}
	}

	private sendToWebSocket(socket: WebSocket, event: ChatRealtimeEvent): void {
		try {
			socket.send(JSON.stringify(event));
		} catch {
			try {
				socket.close(1011, 'Unable to send chat update.');
			} catch {
				// Ignore close failures.
			}
		}
	}

	private broadcast(event: ChatRealtimeEvent): void {
		for (const socket of this.ctx.getWebSockets()) {
			this.sendToWebSocket(socket, event);
		}
		for (const client of this.sseClients.values()) {
			this.sendToSseClient(client, event);
		}
	}

	private snapshotEvent(state: DurableChatState): ChatRealtimeEvent {
		return {
			type: 'snapshot',
			...chatSnapshotFromState(state, this.env)
		};
	}

	private markDirty(): void {
		this.dirty = true;
		this.schedulePersist();
	}

	private schedulePersist(): void {
		if (this.persistTimer || this.persistPromise) {
			return;
		}

		const delay = Math.max(0, this.lastStorageWriteAt + STORAGE_WRITE_INTERVAL_MS - Date.now());
		if (delay === 0) {
			const persist = this.flushIfDirty();
			this.ctx.waitUntil(persist);
			return;
		}

		this.persistTimer = setTimeout(() => {
			this.persistTimer = null;
			const persist = this.flushIfDirty();
			this.ctx.waitUntil(persist);
		}, delay);
	}

	private async flushIfDirty(): Promise<void> {
		if (this.persistPromise) {
			return await this.persistPromise;
		}

		this.persistPromise = (async () => {
			await this.ready;
			if (!this.dirty || !this.state) {
				return;
			}
			const snapshot = cloneChatState(this.state);
			this.dirty = false;
			await this.ctx.storage.put(STORAGE_KEY, snapshot);
			this.lastStorageWriteAt = Date.now();
		})().finally(() => {
			this.persistPromise = null;
			if (this.dirty) {
				this.schedulePersist();
			}
		});

		return await this.persistPromise;
	}

	private async openEvents(request: Request): Promise<Response> {
		const state = await this.getState(request);
		const upgradeHeader = request.headers.get('upgrade');

		if (upgradeHeader?.toLowerCase() === 'websocket') {
			const webSocketPair = new WebSocketPair();
			const [client, server] = Object.values(webSocketPair) as [WebSocket, WebSocket];
			this.ctx.acceptWebSocket(server);
			server.serializeAttachment({
				userId: request.headers.get(CHAT_USER_ID_HEADER),
				chatId: state.chat.id
			});
			this.sendToWebSocket(server, this.snapshotEvent(state));
			return new Response(null, {
				status: 101,
				webSocket: client
			} as ResponseInit);
		}

		const clientId = createRunId();
		const stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				const client = { id: clientId, controller };
				this.sseClients.set(clientId, client);
				this.sendToSseClient(client, this.snapshotEvent(state));
			},
			cancel: () => {
				this.sseClients.delete(clientId);
			}
		});

		return new Response(stream, {
			headers: {
				'content-type': 'text/event-stream; charset=utf-8',
				'cache-control': 'no-cache, no-transform',
				connection: 'keep-alive'
			}
		});
	}

	private appendMessage(state: DurableChatState, message: StoredChatMessage): void {
		state.chat.messages.push(message);
		state.chat.updatedAt = Date.now();
		state.chat.title ??= titleFromMessage(message);
	}

	private requestInputMessages(
		state: DurableChatState,
		assistantMessageId: string
	): LlmInputMessage[] {
		return state.chat.messages
			.filter((message) => message.id !== assistantMessageId)
			.filter((message) => message.role === 'user' || message.text.trim().length > 0)
			.slice(-MAX_HISTORY_MESSAGES)
			.map((message) => ({
				role: message.role,
				content: message.text.slice(0, MAX_MESSAGE_CHARS)
			}));
	}

	private updateAssistant(
		runId: string,
		assistantMessageId: string,
		update: (message: StoredChatMessage, state: DurableChatState) => void
	): StoredChatMessage | null {
		const state = this.state;
		if (!state || state.activeRun?.id !== runId) {
			return null;
		}
		const assistant = getMessage(state, assistantMessageId);
		if (!assistant) {
			return null;
		}
		update(assistant, state);
		state.chat.updatedAt = Date.now();
		this.markDirty();
		return assistant;
	}

	private finishRun(
		runId: string,
		assistantMessageId: string,
		update: (message: StoredChatMessage, state: DurableChatState) => void
	): void {
		const assistant = this.updateAssistant(runId, assistantMessageId, (message, state) => {
			update(message, state);
			state.activeRun = null;
		});
		if (!assistant) {
			return;
		}
		this.broadcast({
			type: 'message_updated',
			message: assistant,
			activeRun: null
		});
		this.broadcast({ type: 'run_finished', activeRun: null });
	}

	private async runModel(activeRun: ActiveChatRun): Promise<void> {
		const state = this.state;
		if (!state || state.activeRun?.id !== activeRun.id) {
			return;
		}

		installLlmProcessEnv(this.env);

		const controller = new AbortController();
		this.activeAbortController = controller;
		const chatModel = resolveChatModel(this.env);
		const instructions = activeRun.contextInstructions
			? `${SYSTEM_PROMPT}\n\n${activeRun.contextInstructions}`
			: SYSTEM_PROMPT;
		const input = this.requestInputMessages(state, activeRun.assistantMessageId);
		const call = streamText({
			model: chatModel,
			thinkingLevel: CHAT_THINKING_LEVEL,
			instructions,
			input,
			signal: controller.signal
		});
		controller.signal.addEventListener('abort', () => call.abort(), { once: true });

		try {
			for await (const event of call.events) {
				if (event.type === 'delta' && event.channel === 'thought') {
					const assistant = this.updateAssistant(
						activeRun.id,
						activeRun.assistantMessageId,
						(message) => {
							message.thoughts = `${message.thoughts ?? ''}${event.text}`;
						}
					);
					if (assistant) {
						this.broadcast({
							type: 'delta',
							messageId: activeRun.assistantMessageId,
							channel: 'thought',
							text: event.text
						});
					}
					continue;
				}
				if (event.type === 'delta' && event.channel === 'response') {
					const assistant = this.updateAssistant(
						activeRun.id,
						activeRun.assistantMessageId,
						(message) => {
							message.text = `${message.text}${event.text}`;
						}
					);
					if (assistant) {
						this.broadcast({
							type: 'delta',
							messageId: activeRun.assistantMessageId,
							channel: 'response',
							text: event.text
						});
					}
					continue;
				}
				if (event.type === 'model') {
					const assistant = this.updateAssistant(
						activeRun.id,
						activeRun.assistantMessageId,
						(message) => {
							message.modelVersion = event.modelVersion;
						}
					);
					if (assistant) {
						this.broadcast({
							type: 'message_updated',
							message: assistant,
							activeRun: this.state?.activeRun ?? null
						});
					}
					continue;
				}
				if (event.type === 'usage') {
					const assistant = this.updateAssistant(
						activeRun.id,
						activeRun.assistantMessageId,
						(message) => {
							message.usage = event.usage satisfies LlmUsageTokens;
							message.costUsd = event.costUsd;
							message.modelVersion = event.modelVersion;
						}
					);
					if (assistant) {
						this.broadcast({
							type: 'message_updated',
							message: assistant,
							activeRun: this.state?.activeRun ?? null
						});
					}
					continue;
				}
				if (event.type === 'blocked') {
					throw new Error('The model blocked this response.');
				}
			}

			const result = await call.result;
			this.finishRun(activeRun.id, activeRun.assistantMessageId, (message) => {
				message.text = result.text;
				message.thoughts = result.thoughts;
				message.status = 'done';
				message.modelVersion = result.modelVersion;
				message.usage = result.usage;
				message.costUsd = result.costUsd;
			});
		} catch (error) {
			const stoppedByUser = this.stoppingRunId === activeRun.id;
			if (stoppedByUser) {
				this.finishRun(activeRun.id, activeRun.assistantMessageId, (message) => {
					message.status = 'done';
				});
			} else {
				const messageText = serializeError(error);
				this.finishRun(activeRun.id, activeRun.assistantMessageId, (message) => {
					message.text = message.text || messageText;
					message.status = 'error';
				});
				this.broadcast({
					type: 'chat_error',
					message: messageText,
					messageId: activeRun.assistantMessageId
				});
			}
		} finally {
			if (this.activeAbortController === controller) {
				this.activeAbortController = null;
			}
			if (this.stoppingRunId === activeRun.id) {
				this.stoppingRunId = null;
			}
		}
	}

	private async postMessage(request: Request): Promise<Response> {
		const state = await this.getState(request);
		if (state.activeRun) {
			return jsonResponse(
				{
					error: 'active_run',
					message: 'A response is already running for this chat.',
					activeRun: state.activeRun
				},
				{ status: 409 }
			);
		}

		let body: z.infer<typeof postMessageBodySchema>;
		try {
			body = postMessageBodySchema.parse(await request.json());
		} catch {
			return jsonResponse(
				{ error: 'invalid_json', message: 'Request body must be JSON.' },
				{ status: 400 }
			);
		}

		const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_MESSAGE_CHARS) : '';
		if (!text) {
			return jsonResponse(
				{ error: 'invalid_message', message: 'Send a non-empty message.' },
				{ status: 400 }
			);
		}

		const userMessage = createStoredMessage({ role: 'user', text });
		const cards = body.cards ?? [];
		if (cards.length > 0) {
			const assistantMessage = createStoredMessage({
				role: 'assistant',
				text:
					body.assistantText?.trim() ||
					'Please confirm this family account change before I do anything.',
				cards,
				status: 'done'
			});
			this.appendMessage(state, userMessage);
			this.appendMessage(state, assistantMessage);
			this.markDirty();
			this.broadcast({ type: 'message_added', message: userMessage, activeRun: null });
			this.broadcast({ type: 'message_added', message: assistantMessage, activeRun: null });
			return jsonResponse(
				{ ok: true, activeRun: null, snapshot: chatSnapshotFromState(state, this.env) },
				{ status: 202 }
			);
		}

		const assistantMessage = createStoredMessage({
			role: 'assistant',
			text: '',
			thoughts: '',
			status: 'streaming'
		});
		const activeRun: ActiveChatRun = {
			id: createRunId(),
			assistantMessageId: assistantMessage.id,
			startedAt: Date.now(),
			contextInstructions: body.contextInstructions
		};

		this.appendMessage(state, userMessage);
		this.appendMessage(state, assistantMessage);
		state.activeRun = activeRun;
		this.markDirty();

		this.broadcast({ type: 'message_added', message: userMessage, activeRun });
		this.broadcast({ type: 'message_added', message: assistantMessage, activeRun });
		this.broadcast({ type: 'run_started', activeRun });

		const run = this.runModel(activeRun);
		this.ctx.waitUntil(run);
		void run;

		return jsonResponse(
			{ ok: true, activeRun, snapshot: chatSnapshotFromState(state, this.env) },
			{ status: 202 }
		);
	}

	private async stopRun(request: Request): Promise<Response> {
		const state = await this.getState(request);
		const activeRun = state.activeRun;
		if (!activeRun) {
			return jsonResponse({ ok: true, activeRun: null });
		}

		this.stoppingRunId = activeRun.id;
		if (this.activeAbortController) {
			this.activeAbortController.abort('Stopped by user.');
		} else {
			this.finishRun(activeRun.id, activeRun.assistantMessageId, (message) => {
				message.status = 'done';
			});
		}

		return jsonResponse({ ok: true, activeRun: null });
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		try {
			const authError = this.requireUser(request);
			if (authError) {
				return authError;
			}

			if (request.method === 'GET' && url.pathname === '/events') {
				return await this.openEvents(request);
			}
			if (request.method === 'GET' && url.pathname === '/state') {
				const state = await this.getState(request);
				return jsonResponse(chatSnapshotFromState(state, this.env));
			}
			if (request.method === 'POST' && url.pathname === '/message') {
				return await this.postMessage(request);
			}
			if (request.method === 'POST' && url.pathname === '/stop') {
				return await this.stopRun(request);
			}

			return jsonResponse(
				{ error: 'not_found', message: 'Unknown chat room route.' },
				{ status: 404 }
			);
		} catch (error) {
			console.error('Chat room Durable Object request failed.', {
				method: request.method,
				pathname: url.pathname,
				chatId: request.headers.get(CHAT_ID_HEADER),
				error: errorForLog(error)
			});
			return jsonResponse(
				{ error: 'chat_room_failed', message: 'Chat storage failed.' },
				{ status: 500 }
			);
		}
	}

	async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
		ws.close(code, reason);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		ws.close(1011, 'Chat socket failed.');
	}
}
