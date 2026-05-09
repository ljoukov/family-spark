import adapter from '@sveltejs/adapter-cloudflare';
import { execFileSync } from 'node:child_process';

function resolveAppVersion() {
	const envVersion =
		process.env.CF_PAGES_COMMIT_SHA ??
		process.env.CF_COMMIT_SHA ??
		process.env.GITHUB_SHA ??
		process.env.COMMIT_SHA;

	if (envVersion) {
		return envVersion;
	}

	try {
		return execFileSync('git', ['rev-parse', 'HEAD'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return 'unknown';
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: adapter({
			config: 'wrangler.sveltekit.jsonc',
			platformProxy: {
				configPath: 'wrangler.sveltekit.jsonc'
			}
		}),
		version: {
			name: resolveAppVersion()
		}
	}
};

export default config;
