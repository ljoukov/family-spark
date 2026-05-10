import { z } from 'zod';

export const learnerAgeBandSchema = z.enum([
	'under_8',
	'child_8_12',
	'young_teen_13_15',
	'older_teen_16_17',
	'adult_18_plus'
]);

export const guardianRoleSchema = z.enum([
	'primary_guardian',
	'secondary_guardian',
	'school_admin',
	'tutor_view_only'
]);

export const supervisionLevelSchema = z.enum(['strict', 'guided', 'balanced', 'light', 'none']);
export const learnerRegionSchema = z.enum(['UK', 'US', 'EU', 'other']);
export const learnerAccountStatusSchema = z.enum([
	'pending_parent_consent',
	'active',
	'restricted',
	'suspended',
	'aged_out_to_adult'
]);

export const learnerLoginModeSchema = z.enum([
	'profile_pin_on_approved_device',
	'family_code_plus_pin',
	'guardian_qr_approval',
	'teen_passkey',
	'teen_username_password'
]);

export const learnerGuardianSchema = z
	.object({
		guardianUserId: z.string().min(1),
		role: guardianRoleSchema,
		verified: z.boolean().default(true),
		canManageSettings: z.boolean().default(true),
		canViewProgress: z.boolean().default(true),
		canReceiveSafetyAlerts: z.boolean().default(true)
	})
	.strict();

export const learnerSupervisionSchema = z
	.object({
		level: supervisionLevelSchema,
		homeworkAnswerPolicy: z
			.enum(['no_direct_answers', 'hints_first', 'exam_practice_allowed'])
			.default('hints_first'),
		freeChatAllowed: z.boolean().default(true),
		webAccessAllowed: z.boolean().default(false),
		imageGenerationAllowed: z.boolean().default(false),
		voiceAllowed: z.boolean().default(false),
		memoryAllowed: z.boolean().default(false),
		sessionTimeLimitMinutes: z.number().int().positive().optional(),
		quietHours: z
			.object({
				start: z.string().regex(/^\d{2}:\d{2}$/u),
				end: z.string().regex(/^\d{2}:\d{2}$/u)
			})
			.optional()
	})
	.strict();

export const learnerPrivacySchema = z
	.object({
		parentCanViewFullChats: z.boolean().default(false),
		parentCanViewLearningSummary: z.boolean().default(true),
		parentCanViewSafetyAlerts: z.boolean().default(true),
		useForModelTraining: z.boolean().default(false),
		personalisedMemory: z.boolean().default(false)
	})
	.strict();

export type LearnerAgeBand = z.infer<typeof learnerAgeBandSchema>;
export type GuardianRole = z.infer<typeof guardianRoleSchema>;
export type SupervisionLevel = z.infer<typeof supervisionLevelSchema>;
export type LearnerRegion = z.infer<typeof learnerRegionSchema>;
export type LearnerLoginMode = z.infer<typeof learnerLoginModeSchema>;
export type LearnerGuardian = z.infer<typeof learnerGuardianSchema>;
export type LearnerSupervision = z.infer<typeof learnerSupervisionSchema>;
export type LearnerPrivacy = z.infer<typeof learnerPrivacySchema>;

export const familyAdultSchema = z
	.object({
		id: z.string().min(1),
		uid: z.string().min(1),
		email: z.string().email(),
		name: z.string().nullable(),
		role: guardianRoleSchema.default('secondary_guardian'),
		joinedAt: z.number().int().positive()
	})
	.strict();

export const familyChildSchema = z
	.object({
		id: z.string().min(1),
		displayName: z.string().min(1).max(80),
		avatarId: z.string().min(1).default('spark'),
		age: z.number().int().min(3).max(19),
		dateOfBirth: z.string().nullable().default(null),
		ageBand: learnerAgeBandSchema,
		yearGroup: z.string().max(40).nullable().default(null),
		region: learnerRegionSchema.default('other'),
		accountStatus: learnerAccountStatusSchema.default('active'),
		guardians: z.array(learnerGuardianSchema),
		loginMode: learnerLoginModeSchema.default('profile_pin_on_approved_device'),
		pinHash: z.string().nullable().default(null),
		pinSalt: z.string().nullable().default(null),
		approvedDeviceIds: z.array(z.string().min(1)).default([]),
		parentCanResetLogin: z.boolean().default(true),
		parentCanApproveNewDevice: z.boolean().default(true),
		loginEmail: z.string().email().nullable(),
		loginUid: z.string().min(1).nullable(),
		supervision: learnerSupervisionSchema,
		privacy: learnerPrivacySchema,
		createdAt: z.number().int().positive(),
		updatedAt: z.number().int().positive()
	})
	.strict();

export const adultInviteSchema = z
	.object({
		id: z.string().min(1),
		email: z.string().email(),
		invitedByAdultId: z.string().min(1),
		status: z.enum(['pending', 'accepted']).default('pending'),
		createdAt: z.number().int().positive(),
		acceptedAt: z.number().int().positive().nullable()
	})
	.strict();

export const familyAccountSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1).max(100),
		familyCode: z.string().min(4).max(20).default('SPARK-1000'),
		familyCodeUpdatedAt: z.number().int().positive().default(1),
		adults: z.array(familyAdultSchema),
		children: z.array(familyChildSchema),
		adultInvites: z.array(adultInviteSchema),
		createdAt: z.number().int().positive(),
		updatedAt: z.number().int().positive()
	})
	.strict();

export const familyViewerSchema = z
	.object({
		role: z.enum(['adult', 'child']),
		adultId: z.string().min(1).nullable(),
		childId: z.string().min(1).nullable()
	})
	.strict();

export const familySessionSchema = z
	.object({
		family: familyAccountSchema,
		viewer: familyViewerSchema
	})
	.strict();

export const chatActionCardSchema = z
	.object({
		id: z.string().min(1),
		kind: z.enum(['create_child', 'invite_adult', 'open_dashboard']),
		title: z.string().min(1),
		body: z.string().min(1),
		status: z.enum(['pending', 'confirmed', 'cancelled', 'done', 'error']).default('pending'),
		confirmLabel: z.string().min(1).nullable().default(null),
		cancelLabel: z.string().min(1).nullable().default(null),
		payload: z.record(z.string(), z.unknown()).default({})
	})
	.strict();

export type FamilyAdult = z.infer<typeof familyAdultSchema>;
export type FamilyChild = z.infer<typeof familyChildSchema>;
export type AdultInvite = z.infer<typeof adultInviteSchema>;
export type FamilyAccount = z.infer<typeof familyAccountSchema>;
export type FamilyViewer = z.infer<typeof familyViewerSchema>;
export type FamilySession = z.infer<typeof familySessionSchema>;
export type ChatActionCard = z.infer<typeof chatActionCardSchema>;

export function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function ageBandFromAge(age: number): LearnerAgeBand {
	if (age < 8) {
		return 'under_8';
	}
	if (age <= 12) {
		return 'child_8_12';
	}
	if (age <= 15) {
		return 'young_teen_13_15';
	}
	if (age <= 17) {
		return 'older_teen_16_17';
	}
	return 'adult_18_plus';
}

export function createDefaultSupervision(ageBand: LearnerAgeBand): LearnerSupervision {
	if (ageBand === 'under_8') {
		return learnerSupervisionSchema.parse({
			level: 'strict',
			homeworkAnswerPolicy: 'no_direct_answers',
			freeChatAllowed: false,
			webAccessAllowed: false,
			imageGenerationAllowed: false,
			voiceAllowed: false,
			memoryAllowed: false,
			sessionTimeLimitMinutes: 20,
			quietHours: { start: '19:30', end: '07:00' }
		});
	}
	if (ageBand === 'child_8_12') {
		return learnerSupervisionSchema.parse({
			level: 'strict',
			homeworkAnswerPolicy: 'no_direct_answers',
			freeChatAllowed: false,
			webAccessAllowed: false,
			imageGenerationAllowed: false,
			voiceAllowed: false,
			memoryAllowed: false,
			sessionTimeLimitMinutes: 35,
			quietHours: { start: '20:30', end: '07:00' }
		});
	}
	if (ageBand === 'young_teen_13_15') {
		return learnerSupervisionSchema.parse({
			level: 'balanced',
			homeworkAnswerPolicy: 'hints_first',
			freeChatAllowed: true,
			webAccessAllowed: false,
			imageGenerationAllowed: false,
			voiceAllowed: false,
			memoryAllowed: false,
			sessionTimeLimitMinutes: 50,
			quietHours: { start: '21:30', end: '07:00' }
		});
	}
	if (ageBand === 'older_teen_16_17') {
		return learnerSupervisionSchema.parse({
			level: 'light',
			homeworkAnswerPolicy: 'exam_practice_allowed',
			freeChatAllowed: true,
			webAccessAllowed: false,
			imageGenerationAllowed: false,
			voiceAllowed: false,
			memoryAllowed: false,
			sessionTimeLimitMinutes: 75
		});
	}
	return learnerSupervisionSchema.parse({
		level: 'none',
		homeworkAnswerPolicy: 'exam_practice_allowed',
		freeChatAllowed: true,
		webAccessAllowed: true,
		imageGenerationAllowed: true,
		voiceAllowed: true,
		memoryAllowed: true
	});
}

export function createDefaultPrivacy(ageBand: LearnerAgeBand): LearnerPrivacy {
	if (ageBand === 'under_8' || ageBand === 'child_8_12') {
		return learnerPrivacySchema.parse({
			parentCanViewFullChats: true,
			parentCanViewLearningSummary: true,
			parentCanViewSafetyAlerts: true,
			useForModelTraining: false,
			personalisedMemory: false
		});
	}
	return learnerPrivacySchema.parse({
		parentCanViewFullChats: false,
		parentCanViewLearningSummary: true,
		parentCanViewSafetyAlerts: true,
		useForModelTraining: false,
		personalisedMemory: ageBand === 'older_teen_16_17'
	});
}

export function defaultLoginModeForAgeBand(ageBand: LearnerAgeBand): LearnerLoginMode {
	if (ageBand === 'under_8' || ageBand === 'child_8_12') {
		return 'profile_pin_on_approved_device';
	}
	if (ageBand === 'young_teen_13_15') {
		return 'family_code_plus_pin';
	}
	return 'teen_passkey';
}
