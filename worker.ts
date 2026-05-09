import svelteWorker from './.svelte-kit/cloudflare/sveltekit-worker.js';
import type { ExecutionContext } from '@cloudflare/workers-types/latest';
export { ChatRoomDurableObject } from './src/lib/server/chat-room-do';

export default {
	fetch(request: Request, env: unknown, ctx: ExecutionContext): Response | Promise<Response> {
		return svelteWorker.fetch(request, env, ctx);
	}
};
