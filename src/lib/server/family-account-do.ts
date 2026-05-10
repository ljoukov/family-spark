import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import {
	createChildForAdult,
	createEmptyFamilyDirectoryState,
	ensureFamilySessionForUser,
	inviteAdultToFamily,
	loginLearnerWithPin,
	parseFamilyDirectoryState,
	updateChildForAdult,
	type FamilyDirectoryState
} from './family-directory';

const STORAGE_KEY = 'family-directory-state';

const authUserSchema = z
	.object({
		uid: z.string().min(1),
		email: z.string().email(),
		name: z.string().nullable(),
		photoUrl: z.string().url().nullable()
	})
	.strict();

const directoryRequestSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('ensureSession'), user: authUserSchema }).strict(),
	z
		.object({
			type: z.literal('loginLearnerWithPin'),
			input: z
				.object({
					familyCode: z.string().min(1),
					displayName: z.string().min(1),
					pin: z.string().min(1),
					deviceId: z.string().min(1)
				})
				.strict()
		})
		.strict(),
	z
		.object({
			type: z.literal('createChild'),
			user: authUserSchema,
			input: z
				.object({
					displayName: z.string().min(1),
					age: z.number(),
					avatarId: z.string().optional(),
					yearGroup: z.string().nullable().optional(),
					region: z.enum(['UK', 'US', 'EU', 'other']).optional(),
					loginMode: z
						.enum([
							'profile_pin_on_approved_device',
							'family_code_plus_pin',
							'guardian_qr_approval',
							'teen_passkey',
							'teen_username_password'
						])
						.optional(),
					pin: z.string().nullable().optional(),
					loginEmail: z.string().email().nullable().optional()
				})
				.strict()
		})
		.strict(),
	z
		.object({
			type: z.literal('inviteAdult'),
			user: authUserSchema,
			input: z.object({ email: z.string().email() }).strict()
		})
		.strict(),
	z
		.object({
			type: z.literal('updateChild'),
			user: authUserSchema,
			input: z
				.object({
					childId: z.string().min(1),
					displayName: z.string().optional(),
					age: z.number().optional(),
					avatarId: z.string().optional(),
					yearGroup: z.string().nullable().optional(),
					region: z.enum(['UK', 'US', 'EU', 'other']).optional(),
					loginMode: z
						.enum([
							'profile_pin_on_approved_device',
							'family_code_plus_pin',
							'guardian_qr_approval',
							'teen_passkey',
							'teen_username_password'
						])
						.optional(),
					pin: z.string().nullable().optional(),
					loginEmail: z.string().email().nullable().optional(),
					supervisionLevel: z.enum(['strict', 'guided', 'balanced', 'light', 'none']).optional(),
					homeworkAnswerPolicy: z
						.enum(['no_direct_answers', 'hints_first', 'exam_practice_allowed'])
						.optional(),
					freeChatAllowed: z.boolean().optional(),
					webAccessAllowed: z.boolean().optional(),
					imageGenerationAllowed: z.boolean().optional(),
					voiceAllowed: z.boolean().optional(),
					memoryAllowed: z.boolean().optional(),
					sessionTimeLimitMinutes: z.number().int().positive().nullable().optional(),
					parentCanViewFullChats: z.boolean().optional(),
					parentCanViewLearningSummary: z.boolean().optional(),
					parentCanViewSafetyAlerts: z.boolean().optional(),
					personalisedMemory: z.boolean().optional(),
					quietHoursEnabled: z.boolean().optional(),
					quietHoursStart: z
						.string()
						.regex(/^\d{2}:\d{2}$/u)
						.optional(),
					quietHoursEnd: z
						.string()
						.regex(/^\d{2}:\d{2}$/u)
						.optional()
				})
				.strict()
		})
		.strict()
]);

type DirectoryRequest = z.infer<typeof directoryRequestSchema>;

type FamilyAccountEnv = Record<string, unknown>;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	const headers = new Headers(init?.headers);
	headers.set('content-type', 'application/json; charset=utf-8');
	return new Response(JSON.stringify(body), { ...init, headers });
}

function errorMessage(error: unknown): string {
	return error instanceof Error && error.message.trim().length > 0
		? error.message
		: 'Family account request failed.';
}

export class FamilyAccountDurableObject extends DurableObject<FamilyAccountEnv> {
	private state: FamilyDirectoryState | null = null;
	private readonly ready: Promise<void>;

	constructor(ctx: DurableObjectState, env: FamilyAccountEnv) {
		super(ctx, env);
		this.ready = this.ctx.blockConcurrencyWhile(() => this.loadState());
	}

	private async loadState(): Promise<void> {
		const stored = await this.ctx.storage.get(STORAGE_KEY);
		if (!stored) {
			this.state = createEmptyFamilyDirectoryState();
			return;
		}
		try {
			this.state = parseFamilyDirectoryState(stored);
		} catch (error) {
			console.error('Stored family directory state could not be parsed.', error);
			await this.ctx.storage.put(`${STORAGE_KEY}:invalid:${Date.now()}`, stored);
			await this.ctx.storage.delete(STORAGE_KEY);
			this.state = createEmptyFamilyDirectoryState();
		}
	}

	private async getState(): Promise<FamilyDirectoryState> {
		await this.ready;
		if (!this.state) {
			this.state = createEmptyFamilyDirectoryState();
		}
		return this.state;
	}

	private async mutate(request: DirectoryRequest): Promise<Response> {
		const state = await this.getState();
		let session;
		if (request.type === 'ensureSession') {
			session = ensureFamilySessionForUser(state, request.user);
		} else if (request.type === 'loginLearnerWithPin') {
			session = await loginLearnerWithPin(state, request.input);
		} else if (request.type === 'createChild') {
			session = await createChildForAdult(state, request.user.uid, request.input);
		} else if (request.type === 'inviteAdult') {
			session = inviteAdultToFamily(state, request.user.uid, request.input);
		} else {
			session = await updateChildForAdult(state, request.user.uid, request.input);
		}
		await this.ctx.storage.put(STORAGE_KEY, state);
		return jsonResponse({ ok: true, session });
	}

	async fetch(request: Request): Promise<Response> {
		if (request.method !== 'POST') {
			return jsonResponse({ error: 'method_not_allowed', message: 'Use POST.' }, { status: 405 });
		}

		try {
			const body = directoryRequestSchema.parse(await request.json());
			return await this.mutate(body);
		} catch (error) {
			console.error('Family account Durable Object request failed.', error);
			return jsonResponse(
				{ error: 'family_account_failed', message: errorMessage(error) },
				{ status: 400 }
			);
		}
	}
}
