export const OPENAI_CHAT_MODEL = 'gpt-5.5-fast' as const;
export const CHAT_THINKING_LEVEL = 'medium' as const;

export type FamilySparkChatModel = typeof OPENAI_CHAT_MODEL;

export function resolveChatModel(platformEnv?: unknown): FamilySparkChatModel {
	void platformEnv;
	return OPENAI_CHAT_MODEL;
}
