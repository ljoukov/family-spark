import { z } from 'zod';
import { CHAT_THINKING_LEVEL, resolveChatModel, type FamilySparkChatModel } from './chat-model';

export const MAX_HISTORY_MESSAGES = 32;
export const MAX_MESSAGE_CHARS = 12_000;
export const CHAT_USER_ID_HEADER = 'x-family-spark-user-id';
export const CHAT_ID_HEADER = 'x-family-spark-chat-id';

export const SYSTEM_PROMPT = [
	'You are Family Spark, a clear and practical assistant for family learning and planning.',
	'Answer directly, ask focused follow-up questions when the user is underspecified, and keep useful structure.',
	'When helping with learning, prefer concrete next actions, examples, and checks for understanding.'
].join('\n');

const usageSchema = z
	.object({
		promptTokens: z.number().optional(),
		responseTokens: z.number().optional(),
		thinkingTokens: z.number().optional(),
		totalTokens: z.number().optional()
	})
	.strict();

export const storedChatMessageSchema = z
	.object({
		id: z.string().min(1),
		role: z.enum(['user', 'assistant']),
		text: z.string(),
		thoughts: z.string().optional(),
		status: z.enum(['streaming', 'done', 'error']).default('done'),
		createdAt: z.number().int().positive(),
		modelVersion: z.string().optional(),
		costUsd: z.number().optional(),
		usage: usageSchema.optional()
	})
	.strict();

export const storedChatSchema = z
	.object({
		id: z.string().min(1),
		title: z.string().nullable(),
		messages: z.array(storedChatMessageSchema),
		createdAt: z.number().int().positive(),
		updatedAt: z.number().int().positive()
	})
	.strict();

export const activeChatRunSchema = z
	.object({
		id: z.string().min(1),
		assistantMessageId: z.string().min(1),
		startedAt: z.number().int().positive()
	})
	.strict();

export const durableChatStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		chat: storedChatSchema,
		activeRun: activeChatRunSchema.nullable()
	})
	.strict();

export type StoredChatMessage = z.infer<typeof storedChatMessageSchema>;
export type StoredChat = z.infer<typeof storedChatSchema>;
export type ActiveChatRun = z.infer<typeof activeChatRunSchema>;
export type DurableChatState = z.infer<typeof durableChatStateSchema>;
export type ChatUsage = z.infer<typeof usageSchema>;

export type ChatSnapshot = {
	chat: StoredChat;
	activeRun: ActiveChatRun | null;
	chatModel: FamilySparkChatModel;
	thinkingLevel: typeof CHAT_THINKING_LEVEL;
};

export type ChatRealtimeEvent =
	| ({ type: 'snapshot' } & ChatSnapshot)
	| { type: 'message_added'; message: StoredChatMessage; activeRun: ActiveChatRun | null }
	| { type: 'message_updated'; message: StoredChatMessage; activeRun: ActiveChatRun | null }
	| { type: 'delta'; messageId: string; channel: 'thought' | 'response'; text: string }
	| { type: 'run_started'; activeRun: ActiveChatRun }
	| { type: 'run_finished'; activeRun: null }
	| { type: 'chat_error'; message: string; messageId?: string };

function createId(): string {
	if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createStoredMessage(
	message: Omit<StoredChatMessage, 'id' | 'createdAt' | 'status'> & {
		id?: string;
		createdAt?: number;
		status?: StoredChatMessage['status'];
	}
): StoredChatMessage {
	return storedChatMessageSchema.parse({
		id: message.id ?? createId(),
		role: message.role,
		text: message.text,
		thoughts: message.thoughts,
		status: message.status ?? 'done',
		createdAt: message.createdAt ?? Date.now(),
		modelVersion: message.modelVersion,
		costUsd: message.costUsd,
		usage: message.usage
	});
}

export function createEmptyChat(chatId: string): StoredChat {
	const now = Date.now();
	return {
		id: chatId,
		title: null,
		messages: [],
		createdAt: now,
		updatedAt: now
	};
}

export function createEmptyChatState(chatId: string): DurableChatState {
	return {
		schemaVersion: 1,
		chat: createEmptyChat(chatId),
		activeRun: null
	};
}

export function titleFromMessage(message: StoredChatMessage): string | null {
	if (message.role !== 'user') {
		return null;
	}
	const compact = message.text.replace(/\s+/gu, ' ').trim();
	if (!compact) {
		return null;
	}
	return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
}

export function cloneChatState(state: DurableChatState): DurableChatState {
	return durableChatStateSchema.parse(JSON.parse(JSON.stringify(state)));
}

export function chatSnapshotFromState(
	state: DurableChatState,
	platformEnv?: unknown
): ChatSnapshot {
	return {
		chat: state.chat,
		activeRun: state.activeRun,
		chatModel: resolveChatModel(platformEnv),
		thinkingLevel: CHAT_THINKING_LEVEL
	};
}
