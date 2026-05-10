/// <reference types="@cloudflare/workers-types/latest" />

import type { DurableObjectNamespace, ExecutionContext } from '@cloudflare/workers-types';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: import('$lib/server/auth/session').AuthUser | null;
		}
		// interface PageData {}
		// interface PageState {}
		interface Platform {
			env?: Record<string, unknown> & {
				CHAT_ROOMS?: DurableObjectNamespace;
				FAMILY_ACCOUNTS?: DurableObjectNamespace;
				FAMILY_SPARK_DO_GATEWAY_ORIGIN?: string;
				FAMILY_SPARK_DO_GATEWAY_TOKEN?: string;
			};
			context?: ExecutionContext;
		}
	}
}

export {};
