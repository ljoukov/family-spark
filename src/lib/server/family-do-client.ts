import type { DurableObjectNamespace, DurableObjectStub } from '@cloudflare/workers-types';
import type { FamilySession, LearnerRegion } from '$lib/family-types';
import type { AuthUser } from './auth/session';
import {
	createChildForAdult,
	createEmptyFamilyDirectoryState,
	ensureFamilySessionForUser,
	inviteAdultToFamily,
	loginLearnerWithPin,
	updateChildForAdult,
	type FamilyDirectoryState
} from './family-directory';

type FamilyPlatformEnv = Record<string, unknown> & {
	FAMILY_ACCOUNTS?: DurableObjectNamespace;
};

type CreateChildInput = {
	displayName: string;
	age: number;
	avatarId?: string;
	yearGroup?: string | null;
	region?: LearnerRegion;
	loginMode?:
		| 'profile_pin_on_approved_device'
		| 'family_code_plus_pin'
		| 'guardian_qr_approval'
		| 'teen_passkey'
		| 'teen_username_password';
	pin?: string | null;
	loginEmail?: string | null;
};

type InviteAdultInput = {
	email: string;
};

type UpdateChildInput = {
	childId: string;
	displayName?: string;
	age?: number;
	avatarId?: string;
	yearGroup?: string | null;
	region?: LearnerRegion;
	loginMode?:
		| 'profile_pin_on_approved_device'
		| 'family_code_plus_pin'
		| 'guardian_qr_approval'
		| 'teen_passkey'
		| 'teen_username_password';
	pin?: string | null;
	loginEmail?: string | null;
	supervisionLevel?: 'strict' | 'guided' | 'balanced' | 'light' | 'none';
	homeworkAnswerPolicy?: 'no_direct_answers' | 'hints_first' | 'exam_practice_allowed';
	freeChatAllowed?: boolean;
	webAccessAllowed?: boolean;
	imageGenerationAllowed?: boolean;
	voiceAllowed?: boolean;
	memoryAllowed?: boolean;
	sessionTimeLimitMinutes?: number | null;
	parentCanViewFullChats?: boolean;
	parentCanViewLearningSummary?: boolean;
	parentCanViewSafetyAlerts?: boolean;
	personalisedMemory?: boolean;
	quietHoursEnabled?: boolean;
	quietHoursStart?: string;
	quietHoursEnd?: string;
};

type DirectoryRequest =
	| { type: 'ensureSession'; user: AuthUser }
	| {
			type: 'loginLearnerWithPin';
			input: { familyCode: string; displayName: string; pin: string; deviceId: string };
	  }
	| { type: 'createChild'; user: AuthUser; input: CreateChildInput }
	| { type: 'inviteAdult'; user: AuthUser; input: InviteAdultInput }
	| { type: 'updateChild'; user: AuthUser; input: UpdateChildInput };

const localState = globalThis as typeof globalThis & {
	__familySparkDirectoryState?: FamilyDirectoryState;
};

function getLocalState(): FamilyDirectoryState {
	localState.__familySparkDirectoryState ??= createEmptyFamilyDirectoryState();
	return localState.__familySparkDirectoryState;
}

function getFamilyNamespace(platformEnv?: unknown): DurableObjectNamespace | null {
	if (!platformEnv || typeof platformEnv !== 'object') {
		return null;
	}
	return (platformEnv as FamilyPlatformEnv).FAMILY_ACCOUNTS ?? null;
}

function getFamilyDirectoryStub(platformEnv?: unknown): DurableObjectStub | null {
	const namespace = getFamilyNamespace(platformEnv);
	if (!namespace) {
		return null;
	}
	return namespace.get(namespace.idFromName('family-directory'));
}

async function applyLocalDirectoryRequest(request: DirectoryRequest): Promise<FamilySession> {
	const state = getLocalState();
	if (request.type === 'ensureSession') {
		return ensureFamilySessionForUser(state, request.user);
	}
	if (request.type === 'loginLearnerWithPin') {
		return await loginLearnerWithPin(state, request.input);
	}
	if (request.type === 'createChild') {
		return await createChildForAdult(state, request.user.uid, request.input);
	}
	if (request.type === 'inviteAdult') {
		return inviteAdultToFamily(state, request.user.uid, request.input);
	}
	return await updateChildForAdult(state, request.user.uid, request.input);
}

async function fetchFamilyDirectory(
	platformEnv: unknown,
	request: DirectoryRequest
): Promise<FamilySession> {
	const stub = getFamilyDirectoryStub(platformEnv);
	if (!stub) {
		return await applyLocalDirectoryRequest(request);
	}

	const response = (await stub.fetch('https://family-spark-family.internal/', {
		method: 'POST',
		headers: { 'content-type': 'application/json; charset=utf-8' },
		body: JSON.stringify(request)
	})) as unknown as Response;
	if (!response.ok) {
		let message = `Family account request failed with status ${response.status}`;
		try {
			const payload = (await response.json()) as { message?: string };
			message = payload.message ?? message;
		} catch {
			// Keep status message.
		}
		throw new Error(message);
	}

	const payload = (await response.json()) as { session: FamilySession };
	return payload.session;
}

export function ensureFamilySession(platformEnv: unknown, user: AuthUser): Promise<FamilySession> {
	return fetchFamilyDirectory(platformEnv, { type: 'ensureSession', user });
}

export function createFamilyChild(
	platformEnv: unknown,
	user: AuthUser,
	input: CreateChildInput
): Promise<FamilySession> {
	return fetchFamilyDirectory(platformEnv, { type: 'createChild', user, input });
}

export function inviteFamilyAdult(
	platformEnv: unknown,
	user: AuthUser,
	input: InviteAdultInput
): Promise<FamilySession> {
	return fetchFamilyDirectory(platformEnv, { type: 'inviteAdult', user, input });
}

export function updateFamilyChild(
	platformEnv: unknown,
	user: AuthUser,
	input: UpdateChildInput
): Promise<FamilySession> {
	return fetchFamilyDirectory(platformEnv, { type: 'updateChild', user, input });
}

export function loginFamilyLearnerWithPin(
	platformEnv: unknown,
	input: { familyCode: string; displayName: string; pin: string; deviceId: string }
): Promise<FamilySession> {
	return fetchFamilyDirectory(platformEnv, { type: 'loginLearnerWithPin', input });
}
