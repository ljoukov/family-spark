<script lang="ts">
	import KeyRound from '@lucide/svelte/icons/key-round';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Child Login | Family Spark</title>
</svelte:head>

<main class="login-page">
	<section class="login-card" aria-labelledby="login-title">
		<div class="brand-mark" aria-hidden="true">
			<KeyRound size={24} />
		</div>
		<div class="copy">
			<p class="eyebrow">Family Spark</p>
			<h1 id="login-title">Child profile login</h1>
			<p class="subcopy">
				Use the family code from a parent, choose your profile, and enter your PIN.
			</p>
		</div>

		<form method="POST">
			<input type="hidden" name="next" value={form?.next ?? data.next} />
			<label for="familyCode">Family code</label>
			<input
				id="familyCode"
				name="familyCode"
				value={form?.familyCode ?? ''}
				autocomplete="off"
				required
			/>

			<label for="displayName">Profile name</label>
			<input
				id="displayName"
				name="displayName"
				value={form?.displayName ?? ''}
				autocomplete="off"
				required
			/>

			<label for="pin">PIN</label>
			<input
				id="pin"
				name="pin"
				type="password"
				inputmode="numeric"
				autocomplete="one-time-code"
				required
			/>

			{#if form?.message}
				<p class="form-error" role="alert">{form.message}</p>
			{/if}

			<button type="submit">Continue</button>
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
		background: #f8faf9;
	}

	.login-card {
		width: min(28rem, 100%);
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 0.75rem;
		background: #ffffff;
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
	}

	.copy {
		margin-top: 1.25rem;
	}

	.eyebrow,
	h1,
	p {
		margin: 0;
	}

	.eyebrow {
		color: rgba(24, 60, 52, 0.72);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
	}

	h1 {
		margin-top: 0.35rem;
		font-size: clamp(2rem, 8vw, 3rem);
		line-height: 1.02;
		letter-spacing: 0;
	}

	.subcopy {
		margin-top: 0.8rem;
		color: rgba(20, 24, 23, 0.66);
		line-height: 1.55;
	}

	form {
		margin-top: 1.35rem;
		display: grid;
		gap: 0.7rem;
	}

	label {
		color: rgba(20, 24, 23, 0.72);
		font-size: 0.78rem;
		font-weight: 700;
	}

	input {
		width: 100%;
		min-height: 2.75rem;
		border: 1px solid rgba(35, 45, 42, 0.18);
		border-radius: 0.55rem;
		background: #fbfcfb;
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
		border-radius: 0.55rem;
		background: #183c34;
		color: #ffffff;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.form-error {
		margin: 0.1rem 0 0;
		color: #8f1d2d;
		font-size: 0.88rem;
		line-height: 1.45;
	}
</style>
