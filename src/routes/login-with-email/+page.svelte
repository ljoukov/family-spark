<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import { untrack } from 'svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let email = $state(untrack(() => form?.email ?? ''));
	let password = $state('');
</script>

<svelte:head>
	<title>Email Login | Family Spark</title>
</svelte:head>

<main class="login-page">
	<section class="login-card" aria-labelledby="login-title">
		<div class="brand-mark" aria-hidden="true">
			<KeyRound size={24} />
		</div>
		<div class="copy">
			<p class="eyebrow">Family Spark</p>
			<h1 id="login-title">Email login</h1>
			<p class="subcopy">Use the Firebase test account for local and deployment checks.</p>
		</div>

		<form method="POST">
			<input type="hidden" name="next" value={form?.next ?? data.next} />
			<label for="email">Email</label>
			<input
				id="email"
				name="email"
				type="email"
				autocomplete="email"
				bind:value={email}
				required
			/>

			<label for="password">Password</label>
			<input
				id="password"
				name="password"
				type="password"
				autocomplete="current-password"
				bind:value={password}
				required
			/>

			{#if form?.message}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}

			<button type="submit">Sign in</button>
		</form>
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
		background: rgba(255, 255, 255, 0.9);
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

	form {
		margin-top: 1.35rem;
		display: grid;
		gap: 0.7rem;
	}

	label {
		font-size: 0.78rem;
		font-weight: 700;
		color: rgba(20, 24, 23, 0.72);
	}

	input {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid rgba(35, 45, 42, 0.18);
		border-radius: 0.65rem;
		background: rgba(255, 255, 255, 0.92);
		color: #141817;
		padding: 0 0.85rem;
		font: inherit;
	}

	input:focus {
		outline: 2px solid rgba(41, 151, 128, 0.3);
		outline-offset: 2px;
	}

	button {
		margin-top: 0.35rem;
		min-height: 3rem;
		border: 0;
		border-radius: 0.7rem;
		background: #183c34;
		color: #ffffff;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 18px 44px -28px rgba(24, 60, 52, 0.78);
	}

	button:hover {
		background: #245a4f;
	}

	.form-error {
		margin: 0.1rem 0 0;
		color: #8f1d2d;
		font-size: 0.88rem;
		line-height: 1.45;
	}
</style>
