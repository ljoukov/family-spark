import {
	ageBandFromAge,
	createDefaultPrivacy,
	createDefaultSupervision,
	defaultLoginModeForAgeBand,
	familyAccountSchema,
	familySessionSchema,
	normalizeEmail,
	type FamilyAccount,
	type FamilyAdult,
	type FamilyChild,
	type FamilySession,
	type LearnerRegion
} from '$lib/family-types';
import type { AuthUser } from './auth/session';
import { z } from 'zod';

const memberLocatorSchema = z
	.object({
		familyId: z.string().min(1),
		role: z.enum(['adult', 'child']),
		adultId: z.string().min(1).nullable(),
		childId: z.string().min(1).nullable()
	})
	.strict();

const familyDirectoryStateSchema = z
	.object({
		schemaVersion: z.literal(1),
		families: z.record(z.string(), familyAccountSchema),
		membershipsByUserId: z.record(z.string(), memberLocatorSchema),
		childLoginEmails: z.record(
			z.string(),
			z.object({ familyId: z.string().min(1), childId: z.string().min(1) }).strict()
		),
		adultInviteEmails: z.record(
			z.string(),
			z.object({ familyId: z.string().min(1), inviteId: z.string().min(1) }).strict()
		)
	})
	.strict();

export type FamilyDirectoryState = z.infer<typeof familyDirectoryStateSchema>;
export type FamilyMemberLocator = z.infer<typeof memberLocatorSchema>;

type CreateChildInput = {
	displayName: string;
	age: number;
	avatarId?: string;
	yearGroup?: string | null;
	region?: LearnerRegion;
	loginMode?: FamilyChild['loginMode'];
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
	loginMode?: FamilyChild['loginMode'];
	pin?: string | null;
	loginEmail?: string | null;
	supervisionLevel?: FamilyChild['supervision']['level'];
	homeworkAnswerPolicy?: FamilyChild['supervision']['homeworkAnswerPolicy'];
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

type LearnerPinLoginInput = {
	familyCode: string;
	displayName: string;
	pin: string;
	deviceId: string;
};

function createId(prefix: string): string {
	const suffix =
		typeof crypto !== 'undefined' && 'randomUUID' in crypto
			? crypto.randomUUID()
			: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
	return `${prefix}_${suffix}`;
}

function createFamilyCode(): string {
	const words = ['STAR', 'ATOM', 'NOVA', 'SPARK', 'ORBIT', 'LEARN'];
	const bytes = new Uint8Array(2);
	crypto.getRandomValues(bytes);
	const word = words[bytes[0] % words.length];
	const number = 1000 + (bytes[1] % 9000);
	return `${word}-${number}`;
}

function normalizeFamilyCode(value: string): string {
	return value.trim().toUpperCase().replace(/\s+/gu, '-');
}

function normalizePin(value: string): string {
	return value.trim();
}

function hex(bytes: ArrayBuffer | Uint8Array): string {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	return [...view].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPin(pin: string, salt: string): Promise<string> {
	const bytes = new TextEncoder().encode(`${salt}:${pin}`);
	return hex(await crypto.subtle.digest('SHA-256', bytes));
}

async function createPinHash(pin: string): Promise<{ pinHash: string; pinSalt: string }> {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	const pinSalt = hex(bytes);
	return { pinSalt, pinHash: await hashPin(pin, pinSalt) };
}

async function verifyPin(child: FamilyChild, pin: string): Promise<boolean> {
	if (!child.pinHash || !child.pinSalt) {
		return false;
	}
	return (await hashPin(pin, child.pinSalt)) === child.pinHash;
}

export function createEmptyFamilyDirectoryState(): FamilyDirectoryState {
	return {
		schemaVersion: 1,
		families: {},
		membershipsByUserId: {},
		childLoginEmails: {},
		adultInviteEmails: {}
	};
}

export function parseFamilyDirectoryState(stored: unknown): FamilyDirectoryState {
	return familyDirectoryStateSchema.parse(stored ?? createEmptyFamilyDirectoryState());
}

function cloneSession(session: FamilySession): FamilySession {
	return familySessionSchema.parse(JSON.parse(JSON.stringify(session)));
}

function getFamilyOrThrow(state: FamilyDirectoryState, familyId: string): FamilyAccount {
	const family = state.families[familyId];
	if (!family) {
		throw new Error('Family account was not found.');
	}
	normalizeFamilyInPlace(family);
	return family;
}

function normalizeFamilyInPlace(family: FamilyAccount): void {
	const familyWithLegacyFields = family as FamilyAccount & {
		familyCode?: string;
		familyCodeUpdatedAt?: number;
	};
	familyWithLegacyFields.familyCode ??= 'SPARK-1000';
	familyWithLegacyFields.familyCodeUpdatedAt ??= 1;
	for (const child of family.children as Array<
		FamilyChild & {
			avatarId?: string;
			yearGroup?: string | null;
			loginMode?: FamilyChild['loginMode'];
			pinHash?: string | null;
			pinSalt?: string | null;
			approvedDeviceIds?: string[];
			parentCanResetLogin?: boolean;
			parentCanApproveNewDevice?: boolean;
		}
	>) {
		child.avatarId ??= 'spark';
		child.yearGroup ??= null;
		child.loginMode ??= defaultLoginModeForAgeBand(child.ageBand);
		child.pinHash ??= null;
		child.pinSalt ??= null;
		child.approvedDeviceIds ??= [];
		child.parentCanResetLogin ??= true;
		child.parentCanApproveNewDevice ??= true;
	}
}

function getAdultOrThrow(
	state: FamilyDirectoryState,
	uid: string
): {
	family: FamilyAccount;
	adult: FamilyAdult;
	locator: FamilyMemberLocator;
} {
	const locator = state.membershipsByUserId[uid];
	if (!locator || locator.role !== 'adult' || !locator.adultId) {
		throw new Error('Only an adult family member can do this.');
	}
	const family = getFamilyOrThrow(state, locator.familyId);
	const adult = family.adults.find((item) => item.id === locator.adultId);
	if (!adult) {
		throw new Error('Adult family member was not found.');
	}
	return { family, adult, locator };
}

function createSessionFromLocator(
	state: FamilyDirectoryState,
	locator: FamilyMemberLocator
): FamilySession {
	const family = getFamilyOrThrow(state, locator.familyId);
	return cloneSession({
		family,
		viewer: {
			role: locator.role,
			adultId: locator.adultId,
			childId: locator.childId
		}
	});
}

function familyNameFromUser(user: AuthUser): string {
	const emailName = user.email.split('@')[0]?.trim() || 'Family';
	const name = user.name?.trim() || emailName;
	const first = name.split(/\s+/u)[0] || 'Family';
	return `${first}'s family`;
}

function addAdultToFamily(
	state: FamilyDirectoryState,
	family: FamilyAccount,
	user: AuthUser,
	role: FamilyAdult['role']
): FamilyMemberLocator {
	const now = Date.now();
	const adult: FamilyAdult = {
		id: createId('adult'),
		uid: user.uid,
		email: normalizeEmail(user.email),
		name: user.name,
		role,
		joinedAt: now
	};

	family.adults.push(adult);
	for (const child of family.children) {
		if (child.guardians.some((guardian) => guardian.guardianUserId === adult.uid)) {
			continue;
		}
		child.guardians.push({
			guardianUserId: adult.uid,
			role: adult.role,
			verified: true,
			canManageSettings: adult.role !== 'tutor_view_only',
			canViewProgress: true,
			canReceiveSafetyAlerts: adult.role !== 'tutor_view_only'
		});
		child.updatedAt = now;
	}
	family.updatedAt = now;
	const locator: FamilyMemberLocator = {
		familyId: family.id,
		role: 'adult',
		adultId: adult.id,
		childId: null
	};
	state.membershipsByUserId[user.uid] = locator;
	return locator;
}

function createFamilyForAdult(state: FamilyDirectoryState, user: AuthUser): FamilySession {
	const now = Date.now();
	const family: FamilyAccount = {
		id: createId('family'),
		name: familyNameFromUser(user),
		familyCode: createFamilyCode(),
		familyCodeUpdatedAt: now,
		adults: [],
		children: [],
		adultInvites: [],
		createdAt: now,
		updatedAt: now
	};
	state.families[family.id] = family;
	const locator = addAdultToFamily(state, family, user, 'primary_guardian');
	return createSessionFromLocator(state, locator);
}

function claimChildLoginIfPresent(
	state: FamilyDirectoryState,
	user: AuthUser
): FamilySession | null {
	const email = normalizeEmail(user.email);
	const match = state.childLoginEmails[email];
	if (!match) {
		return null;
	}

	const family = getFamilyOrThrow(state, match.familyId);
	const child = family.children.find((item) => item.id === match.childId);
	if (!child) {
		delete state.childLoginEmails[email];
		return null;
	}

	child.loginUid = user.uid;
	child.loginEmail = email;
	child.updatedAt = Date.now();
	family.updatedAt = child.updatedAt;

	const locator: FamilyMemberLocator = {
		familyId: family.id,
		role: 'child',
		adultId: null,
		childId: child.id
	};
	state.membershipsByUserId[user.uid] = locator;
	return createSessionFromLocator(state, locator);
}

function claimAdultInviteIfPresent(
	state: FamilyDirectoryState,
	user: AuthUser
): FamilySession | null {
	const email = normalizeEmail(user.email);
	const match = state.adultInviteEmails[email];
	if (!match) {
		return null;
	}

	const family = getFamilyOrThrow(state, match.familyId);
	const invite = family.adultInvites.find((item) => item.id === match.inviteId);
	if (!invite) {
		delete state.adultInviteEmails[email];
		return null;
	}

	const locator = addAdultToFamily(state, family, user, 'secondary_guardian');
	invite.status = 'accepted';
	invite.acceptedAt = Date.now();
	family.updatedAt = invite.acceptedAt;
	return createSessionFromLocator(state, locator);
}

export function ensureFamilySessionForUser(
	state: FamilyDirectoryState,
	user: AuthUser
): FamilySession {
	const learnerMatch = user.uid.match(/^learner:(.+):(child_.+)$/u);
	if (learnerMatch) {
		const family = state.families[learnerMatch[1]];
		const child = family?.children.find((item) => item.id === learnerMatch[2]);
		if (family && child) {
			const locator: FamilyMemberLocator = {
				familyId: family.id,
				role: 'child',
				adultId: null,
				childId: child.id
			};
			state.membershipsByUserId[user.uid] = locator;
			return createSessionFromLocator(state, locator);
		}
	}

	const childSession = claimChildLoginIfPresent(state, user);
	if (childSession) {
		return childSession;
	}

	const existing = state.membershipsByUserId[user.uid];
	if (existing) {
		return createSessionFromLocator(state, existing);
	}

	const adultSession = claimAdultInviteIfPresent(state, user);
	if (adultSession) {
		return adultSession;
	}

	return createFamilyForAdult(state, user);
}

export function createChildForAdult(
	state: FamilyDirectoryState,
	actorUid: string,
	input: CreateChildInput
): Promise<FamilySession> {
	return createChildForAdultInner(state, actorUid, input);
}

async function createChildForAdultInner(
	state: FamilyDirectoryState,
	actorUid: string,
	input: CreateChildInput
): Promise<FamilySession> {
	const { family } = getAdultOrThrow(state, actorUid);
	const displayName = input.displayName.trim().replace(/\s+/gu, ' ');
	const age = Math.trunc(input.age);
	if (displayName.length < 1) {
		throw new Error('Child name is required.');
	}
	if (age < 3 || age > 19) {
		throw new Error('Child age must be between 3 and 19.');
	}

	const loginEmail = input.loginEmail ? normalizeEmail(input.loginEmail) : null;
	if (loginEmail && state.childLoginEmails[loginEmail]) {
		throw new Error('That child login email is already attached to a child profile.');
	}

	const now = Date.now();
	const ageBand = ageBandFromAge(age);
	const pin = input.pin ? normalizePin(input.pin) : '';
	const pinParts = pin ? await createPinHash(pin) : { pinHash: null, pinSalt: null };
	const child: FamilyChild = {
		id: createId('child'),
		displayName,
		avatarId: input.avatarId?.trim() || 'spark',
		age,
		dateOfBirth: null,
		ageBand,
		yearGroup: input.yearGroup?.trim() || null,
		region: input.region ?? 'other',
		accountStatus: 'active',
		guardians: family.adults.map((adult) => ({
			guardianUserId: adult.uid,
			role: adult.role,
			verified: true,
			canManageSettings: adult.role !== 'tutor_view_only',
			canViewProgress: true,
			canReceiveSafetyAlerts: adult.role !== 'tutor_view_only'
		})),
		loginMode: input.loginMode ?? defaultLoginModeForAgeBand(ageBand),
		pinHash: pinParts.pinHash,
		pinSalt: pinParts.pinSalt,
		approvedDeviceIds: [],
		parentCanResetLogin: true,
		parentCanApproveNewDevice: true,
		loginEmail,
		loginUid: null,
		supervision: createDefaultSupervision(ageBand),
		privacy: createDefaultPrivacy(ageBand),
		createdAt: now,
		updatedAt: now
	};

	family.children.push(child);
	family.updatedAt = now;
	if (loginEmail) {
		state.childLoginEmails[loginEmail] = { familyId: family.id, childId: child.id };
	}
	return createSessionFromLocator(state, state.membershipsByUserId[actorUid]);
}

export function inviteAdultToFamily(
	state: FamilyDirectoryState,
	actorUid: string,
	input: InviteAdultInput
): FamilySession {
	const { family, adult } = getAdultOrThrow(state, actorUid);
	const email = normalizeEmail(input.email);
	if (family.adults.some((item) => item.email === email)) {
		throw new Error('That adult is already a family member.');
	}

	const existing = family.adultInvites.find(
		(item) => item.email === email && item.status === 'pending'
	);
	if (existing) {
		return createSessionFromLocator(state, state.membershipsByUserId[actorUid]);
	}

	const now = Date.now();
	const invite = {
		id: createId('invite'),
		email,
		invitedByAdultId: adult.id,
		status: 'pending' as const,
		createdAt: now,
		acceptedAt: null
	};
	family.adultInvites.push(invite);
	family.updatedAt = now;
	state.adultInviteEmails[email] = { familyId: family.id, inviteId: invite.id };
	return createSessionFromLocator(state, state.membershipsByUserId[actorUid]);
}

export function updateChildForAdult(
	state: FamilyDirectoryState,
	actorUid: string,
	input: UpdateChildInput
): Promise<FamilySession> {
	return updateChildForAdultInner(state, actorUid, input);
}

async function updateChildForAdultInner(
	state: FamilyDirectoryState,
	actorUid: string,
	input: UpdateChildInput
): Promise<FamilySession> {
	const { family } = getAdultOrThrow(state, actorUid);
	const child = family.children.find((item) => item.id === input.childId);
	if (!child) {
		throw new Error('Child profile was not found.');
	}

	if (typeof input.displayName === 'string') {
		const displayName = input.displayName.trim().replace(/\s+/gu, ' ');
		if (displayName.length < 1) {
			throw new Error('Child name is required.');
		}
		child.displayName = displayName;
	}

	if (typeof input.avatarId === 'string') {
		child.avatarId = input.avatarId.trim() || 'spark';
	}

	if (input.yearGroup !== undefined) {
		child.yearGroup = input.yearGroup?.trim() || null;
	}

	if (typeof input.age === 'number') {
		const age = Math.trunc(input.age);
		if (age < 3 || age > 19) {
			throw new Error('Child age must be between 3 and 19.');
		}
		child.age = age;
		const ageBand = ageBandFromAge(age);
		if (ageBand !== child.ageBand) {
			child.ageBand = ageBand;
			child.supervision = createDefaultSupervision(ageBand);
			child.privacy = createDefaultPrivacy(ageBand);
		}
	}

	if (input.region) {
		child.region = input.region;
	}

	if (input.loginMode) {
		child.loginMode = input.loginMode;
	}

	if (input.pin !== undefined) {
		const pin = input.pin ? normalizePin(input.pin) : '';
		if (pin) {
			const pinParts = await createPinHash(pin);
			child.pinHash = pinParts.pinHash;
			child.pinSalt = pinParts.pinSalt;
		}
	}

	if (input.loginEmail !== undefined) {
		const loginEmail = input.loginEmail ? normalizeEmail(input.loginEmail) : null;
		const existingLogin = loginEmail ? state.childLoginEmails[loginEmail] : null;
		if (loginEmail && existingLogin?.childId !== child.id) {
			const owner = family.children.find((item) => item.id === existingLogin?.childId);
			if (owner) {
				throw new Error('That child login email is already attached to a child profile.');
			}
			delete state.childLoginEmails[loginEmail];
		}
		if (child.loginEmail && child.loginEmail !== loginEmail) {
			delete state.childLoginEmails[child.loginEmail];
		}
		child.loginEmail = loginEmail;
		if (loginEmail) {
			state.childLoginEmails[loginEmail] = { familyId: family.id, childId: child.id };
		}
	}

	child.supervision = {
		...child.supervision,
		level: input.supervisionLevel ?? child.supervision.level,
		homeworkAnswerPolicy: input.homeworkAnswerPolicy ?? child.supervision.homeworkAnswerPolicy,
		freeChatAllowed: input.freeChatAllowed ?? child.supervision.freeChatAllowed,
		webAccessAllowed: input.webAccessAllowed ?? child.supervision.webAccessAllowed,
		imageGenerationAllowed:
			input.imageGenerationAllowed ?? child.supervision.imageGenerationAllowed,
		voiceAllowed: input.voiceAllowed ?? child.supervision.voiceAllowed,
		memoryAllowed: input.memoryAllowed ?? child.supervision.memoryAllowed,
		sessionTimeLimitMinutes:
			input.sessionTimeLimitMinutes === null
				? undefined
				: (input.sessionTimeLimitMinutes ?? child.supervision.sessionTimeLimitMinutes),
		quietHours: input.quietHoursEnabled
			? {
					start: input.quietHoursStart ?? child.supervision.quietHours?.start ?? '21:00',
					end: input.quietHoursEnd ?? child.supervision.quietHours?.end ?? '07:00'
				}
			: undefined
	};
	child.privacy = {
		...child.privacy,
		parentCanViewFullChats: input.parentCanViewFullChats ?? child.privacy.parentCanViewFullChats,
		parentCanViewLearningSummary:
			input.parentCanViewLearningSummary ?? child.privacy.parentCanViewLearningSummary,
		parentCanViewSafetyAlerts:
			input.parentCanViewSafetyAlerts ?? child.privacy.parentCanViewSafetyAlerts,
		personalisedMemory: input.personalisedMemory ?? child.privacy.personalisedMemory
	};

	const now = Date.now();
	child.updatedAt = now;
	family.updatedAt = now;
	return createSessionFromLocator(state, state.membershipsByUserId[actorUid]);
}

export async function loginLearnerWithPin(
	state: FamilyDirectoryState,
	input: LearnerPinLoginInput
): Promise<FamilySession> {
	const familyCode = normalizeFamilyCode(input.familyCode);
	for (const item of Object.values(state.families)) {
		normalizeFamilyInPlace(item);
	}
	const family = Object.values(state.families).find((item) => item.familyCode === familyCode);
	if (!family) {
		throw new Error('Family code was not found.');
	}

	const displayName = input.displayName.trim().toLowerCase();
	const child = family.children.find((item) => item.displayName.toLowerCase() === displayName);
	if (!child) {
		throw new Error('Learner profile was not found for this family code.');
	}
	if (!(await verifyPin(child, normalizePin(input.pin)))) {
		throw new Error('PIN did not match this learner profile.');
	}

	if (!child.approvedDeviceIds.includes(input.deviceId)) {
		child.approvedDeviceIds.push(input.deviceId);
		child.updatedAt = Date.now();
		family.updatedAt = child.updatedAt;
	}

	const learnerUid = `learner:${family.id}:${child.id}`;
	const locator: FamilyMemberLocator = {
		familyId: family.id,
		role: 'child',
		adultId: null,
		childId: child.id
	};
	state.membershipsByUserId[learnerUid] = locator;
	return createSessionFromLocator(state, locator);
}
