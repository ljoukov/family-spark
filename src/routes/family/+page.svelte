<script lang="ts">
	import { resolve } from '$app/paths';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Clock from '@lucide/svelte/icons/clock';
	import LogOut from '@lucide/svelte/icons/log-out';
	import ShieldCheck from '@lucide/svelte/icons/shield-check';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import Users from '@lucide/svelte/icons/users';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let menuOpen = $state(false);

	const adults = $derived(data.family.adults);
	const children = $derived(data.family.children);
	const isAdult = $derived(data.viewer.role === 'adult');
	const avatarLetter = $derived((data.user.name || data.user.email).slice(0, 1).toUpperCase());

	function ageBandLabel(value: string): string {
		return value
			.replace('child_8_12', '8-12 child')
			.replace('young_teen_13_15', '13-15 young teen')
			.replace('older_teen_16_17', '16-17 older teen')
			.replace('under_8', 'under 8')
			.replace('adult_18_plus', '18+ adult');
	}

	function guardianRoleLabel(value: string): string {
		return value
			.replace('primary_guardian', 'primary guardian')
			.replace('secondary_guardian', 'guardian')
			.replace('school_admin', 'school admin')
			.replace('tutor_view_only', 'tutor view-only');
	}
</script>

<svelte:head>
	<title>Parent Dashboard | Family Spark</title>
</svelte:head>

<main class="dashboard-shell">
	<header class="top-bar">
		<a class="brand" href={resolve('/')}>
			<span class="brand-mark" aria-hidden="true"><Sparkles size={18} /></span>
			<span>Family Spark</span>
		</a>
		<div class="account-menu">
			<button
				class="avatar-button"
				type="button"
				aria-label="Account menu"
				aria-expanded={menuOpen}
				onclick={() => (menuOpen = !menuOpen)}
			>
				<span class="avatar-circle">{avatarLetter}</span>
				<ChevronDown size={15} />
			</button>
			{#if menuOpen}
				<div class="menu-panel">
					<p>{data.user.email}</p>
					<a href={resolve('/')}>Chat</a>
					<a href={resolve('/family')}>Parent dashboard</a>
					<a href={resolve('/auth/logout')} data-sveltekit-reload><LogOut size={15} /> Sign out</a>
				</div>
			{/if}
		</div>
	</header>

	<section class="dashboard">
		<div class="dashboard-head">
			<div>
				<p class="eyebrow">{isAdult ? 'Parent dashboard' : 'Child profile'}</p>
				<h1>{data.family.name}</h1>
			</div>
			<a class="primary-link" href={resolve('/')}>Open chat</a>
		</div>

		{#if form?.message}
			<p class="form-error" role="alert">{form.message}</p>
		{/if}

		{#if !isAdult}
			<section class="panel">
				<h2>Your FamilySpark profile</h2>
				<p class="muted">
					Your account is connected to this family. Your chat uses child-safe learning guidance.
				</p>
				<a class="primary-link" href={resolve('/')}>Start learning chat</a>
			</section>
		{:else}
			<div class="summary-grid">
				<section class="metric">
					<Users size={19} />
					<div>
						<strong>{children.length}</strong>
						<span>{children.length === 1 ? 'child' : 'children'}</span>
					</div>
				</section>
				<section class="metric">
					<UserPlus size={19} />
					<div>
						<strong>{adults.length}</strong>
						<span>{adults.length === 1 ? 'adult' : 'adults'}</span>
					</div>
				</section>
				<section class="metric">
					<ShieldCheck size={19} />
					<div>
						<strong>{data.family.familyCode}</strong>
						<span>family code</span>
					</div>
				</section>
			</div>

			<div class="layout-grid">
				<section class="panel">
					<h2>Add child</h2>
					<form method="POST" action="?/createChild" class="compact-form">
						<label>
							<span>Name</span>
							<input name="displayName" required autocomplete="off" />
						</label>
						<label>
							<span>Age</span>
							<input name="age" type="number" min="3" max="19" required />
						</label>
						<label>
							<span>Avatar</span>
							<select name="avatarId" value="spark">
								<option value="spark">Spark</option>
								<option value="rocket">Rocket</option>
								<option value="atom">Atom</option>
								<option value="book">Book</option>
							</select>
						</label>
						<label>
							<span>Region</span>
							<select name="region" value="US">
								<option value="US">US</option>
								<option value="UK">UK</option>
								<option value="EU">EU</option>
								<option value="other">Other</option>
							</select>
						</label>
						<label class="wide">
							<span>Year group</span>
							<input name="yearGroup" autocomplete="off" placeholder="Year 6, Grade 8, GCSE" />
						</label>
						<label>
							<span>Login mode</span>
							<select name="loginMode" value="profile_pin_on_approved_device">
								<option value="profile_pin_on_approved_device">Avatar + PIN</option>
								<option value="family_code_plus_pin">Family code + PIN</option>
								<option value="teen_passkey">Teen passkey</option>
								<option value="teen_username_password">Teen username/password</option>
							</select>
						</label>
						<label>
							<span>PIN</span>
							<input name="pin" type="password" inputmode="numeric" required />
						</label>
						<label class="wide">
							<span>Optional teen email fallback</span>
							<input name="loginEmail" type="email" autocomplete="off" />
						</label>
						<button type="submit">Add child</button>
					</form>
				</section>

				<section class="panel">
					<h2>Adults</h2>
					<div class="adult-list">
						{#each adults as adult (adult.id)}
							<div class="adult-row">
								<span class="avatar-circle small">{adult.email.slice(0, 1).toUpperCase()}</span>
								<div>
									<strong>{adult.name ?? adult.email}</strong>
									<span>{adult.email} · {guardianRoleLabel(adult.role)}</span>
								</div>
							</div>
						{/each}
					</div>
					<form method="POST" action="?/inviteAdult" class="inline-form">
						<input name="email" type="email" placeholder="guardian@example.com" required />
						<button type="submit">Invite</button>
					</form>
				</section>
			</div>

			<section class="children-section">
				<div class="section-title">
					<h2>Children</h2>
					<p>Profiles can be parent-managed or connected to email/password login.</p>
				</div>

				{#if children.length === 0}
					<div class="empty-panel">
						<h3>No child profiles yet</h3>
						<p>
							Add a child to enable age-aware chat, safe homework mode, and family progress signals.
						</p>
					</div>
				{:else}
					<div class="child-grid">
						{#each children as child (child.id)}
							<form method="POST" action="?/updateChild" class="child-card">
								<input type="hidden" name="childId" value={child.id} />
								<div class="child-card-head">
									<div>
										<input
											class="child-name"
											name="displayName"
											value={child.displayName}
											required
										/>
										<p>
											{ageBandLabel(child.ageBand)} · age {child.age} · {child.region}
											{#if child.yearGroup}
												· {child.yearGroup}
											{/if}
										</p>
									</div>
									<a href={resolve('/family/child/[childId]/chat', { childId: child.id })}
										>Open chat</a
									>
								</div>

								<div class="settings-grid">
									<label>
										<span>Age</span>
										<input name="age" type="number" min="3" max="19" value={child.age} required />
									</label>
									<label>
										<span>Avatar</span>
										<select name="avatarId" value={child.avatarId}>
											<option value="spark">Spark</option>
											<option value="rocket">Rocket</option>
											<option value="atom">Atom</option>
											<option value="book">Book</option>
										</select>
									</label>
									<label>
										<span>Region</span>
										<select name="region" value={child.region}>
											<option value="US">US</option>
											<option value="UK">UK</option>
											<option value="EU">EU</option>
											<option value="other">Other</option>
										</select>
									</label>
									<label>
										<span>Year group</span>
										<input name="yearGroup" value={child.yearGroup ?? ''} />
									</label>
									<label>
										<span>Login mode</span>
										<select name="loginMode" value={child.loginMode}>
											<option value="profile_pin_on_approved_device">Avatar + PIN</option>
											<option value="family_code_plus_pin">Family code + PIN</option>
											<option value="guardian_qr_approval">Guardian QR approval</option>
											<option value="teen_passkey">Teen passkey</option>
											<option value="teen_username_password">Teen username/password</option>
										</select>
									</label>
									<label>
										<span>Reset PIN</span>
										<input
											name="pin"
											type="password"
											inputmode="numeric"
											placeholder="Leave blank"
										/>
									</label>
									<label>
										<span>Optional teen email</span>
										<input name="loginEmail" type="email" value={child.loginEmail ?? ''} />
									</label>
									<label>
										<span>Supervision</span>
										<select name="supervisionLevel" value={child.supervision.level}>
											<option value="strict">Strict</option>
											<option value="guided">Guided</option>
											<option value="balanced">Balanced</option>
											<option value="light">Light</option>
											<option value="none">None</option>
										</select>
									</label>
									<label>
										<span>Homework answers</span>
										<select
											name="homeworkAnswerPolicy"
											value={child.supervision.homeworkAnswerPolicy}
										>
											<option value="no_direct_answers">No direct answers</option>
											<option value="hints_first">Hints first</option>
											<option value="exam_practice_allowed">Exam practice allowed</option>
										</select>
									</label>
									<label>
										<span>Time limit</span>
										<input
											name="sessionTimeLimitMinutes"
											type="number"
											min="5"
											max="240"
											value={child.supervision.sessionTimeLimitMinutes ?? ''}
										/>
									</label>
								</div>

								<div class="toggle-row">
									<label>
										<input
											name="freeChatAllowed"
											type="checkbox"
											checked={child.supervision.freeChatAllowed}
										/>
										<span>Free chat</span>
									</label>
									<label>
										<input
											name="webAccessAllowed"
											type="checkbox"
											checked={child.supervision.webAccessAllowed}
										/>
										<span>Web access</span>
									</label>
									<label>
										<input
											name="imageGenerationAllowed"
											type="checkbox"
											checked={child.supervision.imageGenerationAllowed}
										/>
										<span>Images</span>
									</label>
									<label>
										<input
											name="voiceAllowed"
											type="checkbox"
											checked={child.supervision.voiceAllowed}
										/>
										<span>Voice</span>
									</label>
									<label>
										<input
											name="memoryAllowed"
											type="checkbox"
											checked={child.supervision.memoryAllowed}
										/>
										<span>Memory</span>
									</label>
									<label>
										<input
											name="quietHoursEnabled"
											type="checkbox"
											checked={Boolean(child.supervision.quietHours)}
										/>
										<span>Quiet hours</span>
									</label>
								</div>

								<div class="quiet-row">
									<Clock size={16} />
									<input
										name="quietHoursStart"
										type="time"
										value={child.supervision.quietHours?.start ?? '21:00'}
									/>
									<span>to</span>
									<input
										name="quietHoursEnd"
										type="time"
										value={child.supervision.quietHours?.end ?? '07:00'}
									/>
								</div>

								<div class="toggle-row privacy-row">
									<label>
										<input
											name="parentCanViewFullChats"
											type="checkbox"
											checked={child.privacy.parentCanViewFullChats}
										/>
										<span>Parent full chats</span>
									</label>
									<label>
										<input
											name="parentCanViewLearningSummary"
											type="checkbox"
											checked={child.privacy.parentCanViewLearningSummary}
										/>
										<span>Learning summaries</span>
									</label>
									<label>
										<input
											name="parentCanViewSafetyAlerts"
											type="checkbox"
											checked={child.privacy.parentCanViewSafetyAlerts}
										/>
										<span>Safety alerts</span>
									</label>
									<label>
										<input
											name="personalisedMemory"
											type="checkbox"
											checked={child.privacy.personalisedMemory}
										/>
										<span>Personalised memory</span>
									</label>
								</div>

								<button type="submit">Save settings</button>
							</form>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
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
		background: #f7f9f8;
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

	:global(button),
	:global(input),
	:global(select) {
		font: inherit;
	}

	.dashboard-shell {
		min-height: 100dvh;
		background: #f7f9f8;
	}

	.top-bar {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		padding: 0.85rem clamp(1rem, 4vw, 2rem);
		border-bottom: 1px solid rgba(35, 45, 42, 0.1);
		background: rgba(247, 249, 248, 0.9);
		backdrop-filter: blur(16px);
	}

	.brand {
		display: inline-flex;
		align-items: center;
		gap: 0.65rem;
		color: #15211e;
		text-decoration: none;
		font-weight: 720;
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		border-radius: 0.5rem;
		background: #183c34;
		color: #ffffff;
	}

	.account-menu {
		position: relative;
	}

	.avatar-button {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 999px;
		background: #ffffff;
		padding: 0.2rem 0.5rem 0.2rem 0.2rem;
		color: #24302d;
		cursor: pointer;
	}

	.avatar-circle {
		display: grid;
		place-items: center;
		width: 2rem;
		height: 2rem;
		border-radius: 999px;
		background: #183c34;
		color: #ffffff;
		font-weight: 760;
	}

	.avatar-circle.small {
		width: 2.05rem;
		height: 2.05rem;
		font-size: 0.8rem;
	}

	.menu-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
		width: min(17rem, calc(100vw - 2rem));
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 0.5rem;
		background: #ffffff;
		box-shadow: 0 24px 54px -38px rgba(28, 34, 31, 0.58);
		padding: 0.45rem;
	}

	.menu-panel p {
		margin: 0;
		padding: 0.55rem 0.6rem;
		color: rgba(20, 24, 23, 0.58);
		font-size: 0.78rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.menu-panel a {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 0.4rem;
		padding: 0.6rem;
		color: #1c2825;
		text-decoration: none;
		font-size: 0.92rem;
	}

	.menu-panel a:hover {
		background: #eef5f2;
	}

	.dashboard {
		width: min(76rem, 100%);
		margin: 0 auto;
		padding: clamp(1rem, 4vw, 2rem);
	}

	.dashboard-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.eyebrow {
		margin: 0;
		color: #49635c;
		font-size: 0.78rem;
		font-weight: 760;
		text-transform: uppercase;
	}

	h1,
	h2,
	h3,
	p {
		margin: 0;
	}

	h1 {
		margin-top: 0.2rem;
		font-size: clamp(2rem, 5vw, 3.2rem);
		line-height: 1.02;
		letter-spacing: 0;
	}

	h2 {
		font-size: 1rem;
	}

	.primary-link,
	.panel button,
	.child-card button,
	.inline-form button {
		display: inline-flex;
		justify-content: center;
		align-items: center;
		min-height: 2.6rem;
		border: 0;
		border-radius: 0.5rem;
		background: #183c34;
		color: #ffffff;
		padding: 0 0.85rem;
		text-decoration: none;
		font-weight: 720;
		cursor: pointer;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.metric,
	.panel,
	.child-card,
	.empty-panel {
		border: 1px solid rgba(35, 45, 42, 0.1);
		border-radius: 0.5rem;
		background: #ffffff;
		box-shadow: 0 20px 46px -40px rgba(28, 34, 31, 0.48);
	}

	.metric {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		padding: 1rem;
		color: #183c34;
	}

	.metric div {
		display: grid;
		gap: 0.1rem;
		min-width: 0;
	}

	.metric strong {
		color: #141817;
	}

	.metric span,
	.muted,
	.section-title p,
	.empty-panel p,
	.child-card-head p,
	.adult-row span {
		color: rgba(20, 24, 23, 0.58);
		font-size: 0.86rem;
		line-height: 1.45;
	}

	.layout-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 1rem;
		margin-bottom: 1.25rem;
	}

	.panel {
		padding: 1rem;
	}

	.compact-form {
		margin-top: 0.8rem;
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) 6rem;
		gap: 0.7rem;
	}

	.compact-form .wide,
	.compact-form button {
		grid-column: 1 / -1;
	}

	label {
		display: grid;
		gap: 0.35rem;
		color: rgba(20, 24, 23, 0.66);
		font-size: 0.78rem;
		font-weight: 700;
	}

	input,
	select {
		width: 100%;
		min-height: 2.45rem;
		border: 1px solid rgba(35, 45, 42, 0.14);
		border-radius: 0.45rem;
		background: #fbfcfb;
		color: #141817;
		padding: 0 0.65rem;
	}

	input:focus,
	select:focus {
		outline: 2px solid rgba(41, 151, 128, 0.25);
		outline-offset: 1px;
	}

	.adult-list {
		margin: 0.8rem 0;
		display: grid;
		gap: 0.65rem;
	}

	.adult-row {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
	}

	.adult-row div {
		display: grid;
		min-width: 0;
	}

	.adult-row strong,
	.adult-row span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.inline-form {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 0.6rem;
	}

	.section-title {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.child-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
	}

	.child-card {
		display: grid;
		gap: 0.85rem;
		padding: 1rem;
	}

	.child-card-head {
		display: flex;
		justify-content: space-between;
		gap: 0.8rem;
		align-items: start;
	}

	.child-card-head a {
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 0.45rem;
		background: #ffffff;
		padding: 0.48rem 0.65rem;
		color: #183c34;
		text-decoration: none;
		font-weight: 720;
		white-space: nowrap;
		cursor: pointer;
	}

	.child-name {
		min-height: 2.1rem;
		border-color: transparent;
		background: transparent;
		padding: 0;
		font-size: 1.35rem;
		font-weight: 760;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.7rem;
	}

	.toggle-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.8rem;
	}

	.toggle-row label {
		display: inline-flex;
		align-items: center;
		grid-auto-flow: column;
		gap: 0.45rem;
	}

	.toggle-row input {
		width: 1rem;
		min-height: 1rem;
	}

	.quiet-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(20, 24, 23, 0.62);
	}

	.quiet-row input {
		width: 7.25rem;
	}

	.empty-panel {
		padding: 1.2rem;
	}

	.form-error {
		margin-bottom: 1rem;
		border: 1px solid rgba(178, 63, 63, 0.22);
		border-radius: 0.5rem;
		background: #fff4f1;
		color: #8b2d28;
		padding: 0.75rem 0.9rem;
	}

	@media (max-width: 820px) {
		.summary-grid,
		.layout-grid,
		.child-grid {
			grid-template-columns: 1fr;
		}

		.dashboard-head,
		.section-title {
			align-items: start;
			flex-direction: column;
		}
	}

	@media (max-width: 520px) {
		.dashboard,
		.top-bar {
			padding-inline: 0.85rem;
		}

		.settings-grid,
		.compact-form,
		.inline-form {
			grid-template-columns: 1fr;
		}

		.child-card-head {
			flex-direction: column;
		}
	}
</style>
