<script lang="ts">
	import { resolve } from '$app/paths';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const loginHref = $derived(resolve(`/auth/start?next=${encodeURIComponent(data.next)}`));
</script>

<svelte:head>
	<title>Sign In | Family Spark</title>
</svelte:head>

<main class="login-page">
	<section class="login-card" aria-labelledby="login-title">
		<div class="brand-mark" aria-hidden="true">
			<Sparkles size={24} />
		</div>
		<div class="copy">
			<p class="eyebrow">Family Spark</p>
			<h1 id="login-title">Sign in to continue</h1>
			<p class="subcopy">
				Use any Google account. Authentication is handled on the server, and the browser only
				receives a secure session cookie.
			</p>
		</div>
		<a class="login-button" href={loginHref} data-sveltekit-reload>
			<span class="google-g" aria-hidden="true">G</span>
			<span>Continue with Google</span>
		</a>
		<a class="child-link" href={resolve(`/child-login?next=${encodeURIComponent(data.next)}`)}>
			Child profile login
		</a>
	</section>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(html),
	:global(body) {
		margin: 0;
		min-height: 100%;
		background: #f8faf9;
		color: #141817;
		font-family:
			Inter,
			ui-sans-serif,
			system-ui,
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			sans-serif;
	}

	.login-page {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: clamp(1rem, 5vw, 2rem);
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 249, 0.96)),
			radial-gradient(circle at 18% 10%, rgba(41, 151, 128, 0.16), transparent 25rem),
			radial-gradient(circle at 85% 5%, rgba(192, 119, 56, 0.11), transparent 24rem);
	}

	.login-card {
		width: min(27rem, 100%);
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 0.9rem;
		background: rgba(255, 255, 255, 0.88);
		box-shadow: 0 28px 80px -56px rgba(28, 34, 31, 0.6);
		padding: clamp(1.35rem, 5vw, 2rem);
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 3rem;
		height: 3rem;
		border-radius: 0.7rem;
		background: #183c34;
		color: #ffffff;
		box-shadow: 0 16px 32px -24px rgba(24, 60, 52, 0.7);
	}

	.copy {
		margin-top: 1.35rem;
	}

	.eyebrow {
		margin: 0;
		color: rgba(24, 60, 52, 0.72);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	h1 {
		margin: 0.35rem 0 0;
		font-size: clamp(2rem, 8vw, 3rem);
		line-height: 1.02;
		font-weight: 750;
		letter-spacing: 0;
	}

	.subcopy {
		margin: 0.8rem 0 0;
		color: rgba(20, 24, 23, 0.66);
		font-size: 0.98rem;
		line-height: 1.58;
	}

	.login-button {
		margin-top: 1.35rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.65rem;
		min-height: 3rem;
		border-radius: 0.7rem;
		background: #183c34;
		color: #ffffff;
		text-decoration: none;
		font-weight: 700;
		box-shadow: 0 18px 44px -28px rgba(24, 60, 52, 0.78);
		transition:
			background 0.16s ease,
			transform 0.16s ease;
	}

	.login-button:hover {
		background: #245a4f;
		transform: translateY(-1px);
	}

	.child-link {
		margin-top: 0.8rem;
		display: flex;
		justify-content: center;
		color: #183c34;
		font-weight: 700;
		text-decoration: none;
	}

	.google-g {
		display: grid;
		place-items: center;
		width: 1.45rem;
		height: 1.45rem;
		border-radius: 999px;
		background: #ffffff;
		color: #183c34;
		font-weight: 800;
		font-size: 0.88rem;
	}
</style>
