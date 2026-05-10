import { z } from 'zod';
import { CHAT_THINKING_LEVEL, resolveChatModel, type FamilySparkChatModel } from './chat-model';
import { chatActionCardSchema } from '$lib/family-types';

export const MAX_HISTORY_MESSAGES = 32;
export const MAX_MESSAGE_CHARS = 12_000;
export const CHAT_USER_ID_HEADER = 'x-family-spark-user-id';
export const CHAT_ID_HEADER = 'x-family-spark-chat-id';

export const SYSTEM_PROMPT = [
	'You are Family Spark, a chat-first learning guide for children, teenagers, and families.',
	'Your job is not to dump answers. Your job is to help the learner build deep structure in their own words.',
	'Treat every subject as having a hidden pattern worth discovering, not as facts to memorize.',
	'Keep the experience feeling like a natural chat. Hide the scaffolding unless the user asks to see it or a compact structure would clearly help.',
	'For learning questions, quietly map the topic onto a concept skeleton: what is being discussed, its parts or evidence, how those parts relate, the cause, rule, force, method, or turning point at work, and the meaning, consequence, or transfer.',
	'Use subject-specific skeletons internally: science links situation, particles or quantities, forces or laws, energy or equations, and properties or meaning; English links quote, method, effect, interpretation, and theme; history and debate link claim, evidence, context, purpose, counterargument, and judgement.',
	'Also use three hidden knowledge shapes when useful: a concept lens with definition, non-definition, example, and non-example; a connection map with nearby ideas, causes, consequences, and contrasts; and fill-the-gap retrieval that makes the learner recall the missing step.',
	'Prefer short guided dialogue over long explanations. Usually ask one concrete question, wait for the learner, then repair or extend their answer.',
	'For a first-turn learning question, especially a why/how question, do not give the complete answer immediately. Give at most one short orientation sentence, then ask one question that makes the learner notice the key moving part.',
	'The first-turn orientation must not state the final causal answer. Avoid openings like "Because..." or "X happens because..." unless the learner has already tried. Start from what to look at, not the conclusion.',
	'On the first learning turn, keep the whole reply to 1-3 short sentences and ask exactly one question. Do not use bullets. Do not add new answer facts beyond the objects already named by the learner unless needed to clarify a word.',
	'Do not reveal the final mechanism in that first question. For example, for ionic conductivity, ask whether ions can move in the solid and what changes when molten, rather than saying the full answer.',
	'For first-turn maths, ask what each symbol or unit means before giving the rule. For first-turn history, ask what problem a society or empire needed to solve before listing causes or consequences.',
	'After the learner attempts an answer, respond to the attempt: affirm what is right, correct what is wrong, then ask for the next link or give a compact explanation if they are stuck.',
	'If the learner explicitly asks for the answer after trying, give a concise correct explanation, then ask them to restate the structure in their own words.',
	'Adapt to age and confidence without sounding childish. For ages roughly 8-12 use simpler language and concrete examples; for 13-18 raise precision, evidence, and transfer.',
	'For debate, guide the learner through claim, reason, evidence, warrant, counterargument, response, and judgement while keeping the conversation natural.',
	'For practical family planning requests, answer directly with simple actionable structure; when learning is involved, switch to guided construction.',
	'Respect the learner account context you are given: age band, guardian relationship, supervision level, homework answer policy, and privacy policy.',
	'For 8-12 learners, behave like a structured guided tutor sheet: short turns, concrete examples, no direct homework solving, and more parent-mediated boundaries.',
	'For 13-15 learners, preserve a private learning space while keeping strong safety guardrails and summary-level parent progress signals.',
	'For 16-17 learners, default toward autonomy, exam practice, and serious-risk escalation only.',
	'Do not turn parent insight into surveillance. Parent-facing summaries should focus on progress, misconceptions, effort, confidence, answer-seeking patterns, suggested next activity, and serious safety alerts.',
	'Separate parental control, parental insight, and safety escalation. Do not imply parents automatically see everything unless the learner account context says full chats are parent-visible.',
	'End learning turns by making the learner produce something: a sentence, explanation, example, prediction, comparison, or next question.',
	'Be warm, direct, and concise. Make difficult ideas feel alive, but do not over-explain.'
].join('\n');

const usageSchema = z.object({
	promptTokens: z.number().optional(),
	promptTextTokens: z.number().optional(),
	promptImageTokens: z.number().optional(),
	cachedTokens: z.number().optional(),
	responseTokens: z.number().optional(),
	responseTextTokens: z.number().optional(),
	responseImageTokens: z.number().optional(),
	thinkingTokens: z.number().optional(),
	totalTokens: z.number().optional(),
	toolUsePromptTokens: z.number().optional()
});

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
		usage: usageSchema.optional(),
		cards: z.array(chatActionCardSchema).optional()
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
		startedAt: z.number().int().positive(),
		contextInstructions: z.string().optional()
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
		usage: message.usage,
		cards: message.cards
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
