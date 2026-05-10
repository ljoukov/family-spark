<script lang="ts">
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount, tick, untrack } from 'svelte';
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import LogOut from '@lucide/svelte/icons/log-out';
	import RotateCcw from '@lucide/svelte/icons/rotate-cw';
	import Settings from '@lucide/svelte/icons/settings';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import Square from '@lucide/svelte/icons/square';
	import Users from '@lucide/svelte/icons/users';
	import { createChatId } from '$lib/chat-ids';
	import type {
		ActiveChatRun,
		ChatRealtimeEvent,
		ChatSnapshot,
		StoredChatMessage
	} from '$lib/server/chat-types';
	import type { ChatActionCard } from '$lib/family-types';
	import type { PageData } from './$types';

	type ChatRole = 'user' | 'assistant';
	type ChatPhase = 'idle' | 'connecting' | 'thinking' | 'responding';
	type ChatStatus = 'streaming' | 'done' | 'error';
	type Usage = {
		promptTokens?: number;
		promptTextTokens?: number;
		promptImageTokens?: number;
		cachedTokens?: number;
		responseTokens?: number;
		responseTextTokens?: number;
		responseImageTokens?: number;
		thinkingTokens?: number;
		totalTokens?: number;
		toolUsePromptTokens?: number;
	};
	type ChatMessage = {
		id: string;
		role: ChatRole;
		text: string;
		thoughts: string;
		status: ChatStatus;
		modelVersion?: string;
		costUsd?: number;
		usage?: Usage;
		cards?: ChatActionCard[];
	};

	const MAX_COMPOSER_LINES = 12;
	const MAX_COMPOSER_CHARS = 12_000;

	let { data }: { data: PageData } = $props();

	function initialMessages(): ChatMessage[] {
		return (
			data.chat?.messages.map((message) => ({
				id: message.id,
				role: message.role,
				text: message.text,
				thoughts: message.thoughts ?? '',
				status: message.status,
				modelVersion: message.modelVersion,
				costUsd: message.costUsd,
				usage: message.usage
			})) ?? []
		);
	}

	let messages = $state<ChatMessage[]>(untrack(initialMessages));
	let loadedChatId = $state(untrack(() => data.chatId));
	let chatId = $state(untrack(() => data.chatId));
	let activeRun = $state<ActiveChatRun | null>(untrack(() => data.activeRun));
	let draft = $state('');
	let sending = $state(untrack(() => data.activeRun !== null));
	let error = $state<string | null>(null);
	let phase = $state<ChatPhase>(untrack(() => phaseFromMessages(data.activeRun)));
	let activeAssistantId = $state<string | null>(
		untrack(() => data.activeRun?.assistantMessageId ?? null)
	);
	let pendingScrollMessageId = $state<string | null>(null);
	let lastScrollMessageId = $state<string | null>(null);
	let composerRef = $state<HTMLDivElement | null>(null);
	let textareaRef = $state<HTMLTextAreaElement | null>(null);
	let postController = $state<AbortController | null>(null);
	let menuOpen = $state(false);
	let activeChildId = $state<string | null>(
		untrack(() => data.familyContext.activeChild?.id ?? null)
	);
	let cardFeedback = $state<Record<string, string>>({});

	const canSend = $derived(draft.trim().length > 0 && !sending);
	const hasThread = $derived(messages.length > 0);
	const isAdult = $derived(data.familyContext.canManageFamily);
	const avatarLabel = $derived(
		(data.user?.name || data.user?.email || 'F').slice(0, 1).toUpperCase()
	);
	const activeChild = $derived(data.familyContext.activeChild);
	const children = $derived(data.familyContext.family.children);
	const chatScopeLabel = $derived(
		activeChild ? `${activeChild.displayName}, age ${activeChild.age}` : 'Family chat'
	);

	function updateMessage(id: string, update: Partial<ChatMessage>): void {
		messages = messages.map((message) => (message.id === id ? { ...message, ...update } : message));
	}

	function upsertMessage(message: ChatMessage): void {
		let replaced = false;
		messages = messages.map((existing) => {
			if (existing.id !== message.id) {
				return existing;
			}
			replaced = true;
			return message;
		});
		if (!replaced) {
			messages = [...messages, message];
		}
	}

	function ensureAssistantMessage(messageId: string): void {
		if (messages.some((message) => message.id === messageId)) {
			return;
		}
		messages = [
			...messages,
			{
				id: messageId,
				role: 'assistant',
				text: '',
				thoughts: '',
				status: 'streaming'
			}
		];
	}

	function toChatMessage(message: StoredChatMessage): ChatMessage {
		return {
			id: message.id,
			role: message.role,
			text: message.text,
			thoughts: message.thoughts ?? '',
			status: message.status,
			modelVersion: message.modelVersion,
			costUsd: message.costUsd,
			usage: message.usage,
			cards: message.cards
		};
	}

	function phaseFromMessages(run: ActiveChatRun | null): ChatPhase {
		if (!run) {
			return 'idle';
		}
		const assistant = messages.find((message) => message.id === run.assistantMessageId);
		if (assistant?.text.trim()) {
			return 'responding';
		}
		if (assistant?.thoughts.trim()) {
			return 'thinking';
		}
		return 'connecting';
	}

	function appendMessageText(id: string, delta: string): void {
		if (!delta) {
			return;
		}
		messages = messages.map((message) =>
			message.id === id ? { ...message, text: `${message.text}${delta}` } : message
		);
	}

	function appendMessageThoughts(id: string, delta: string): void {
		if (!delta) {
			return;
		}
		messages = messages.map((message) =>
			message.id === id ? { ...message, thoughts: `${message.thoughts}${delta}` } : message
		);
	}

	function resetConversation(): void {
		const childQuery = activeChildId ? `?child=${encodeURIComponent(activeChildId)}` : '';
		void goto(resolve(`/${createChatId()}${childQuery}`));
	}

	async function stopResponse(): Promise<void> {
		if (!activeRun) {
			return;
		}
		try {
			const childQuery = activeChildId ? `?child=${encodeURIComponent(activeChildId)}` : '';
			await fetch(resolve(`/api/chat/${chatId}/stop${childQuery}`), { method: 'POST' });
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unable to stop the response.';
		}
	}

	function resizeTextarea(): void {
		if (!textareaRef) {
			return;
		}
		textareaRef.style.height = 'auto';
		const style = getComputedStyle(textareaRef);
		const lineHeight = Number.parseFloat(style.lineHeight) || 24;
		const paddingTop = Number.parseFloat(style.paddingTop) || 0;
		const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
		const maxHeight = lineHeight * MAX_COMPOSER_LINES + paddingTop + paddingBottom;
		const nextHeight = Math.min(textareaRef.scrollHeight, maxHeight);
		textareaRef.style.height = `${nextHeight}px`;
		textareaRef.style.overflowY = textareaRef.scrollHeight > maxHeight ? 'auto' : 'hidden';
	}

	function handleComposerInput(event: Event): void {
		const target = event.target as HTMLTextAreaElement;
		draft = target.value;
		resizeTextarea();
	}

	function handleComposerKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Enter' || event.shiftKey || event.isComposing) {
			return;
		}
		event.preventDefault();
		void sendMessage();
	}

	function formatTokenCount(usage: Usage | undefined): string | null {
		if (!usage) {
			return null;
		}
		const parts: string[] = [];
		if (typeof usage.promptTokens === 'number') {
			parts.push(`${usage.promptTokens.toLocaleString()} in`);
		}
		if (typeof usage.cachedTokens === 'number' && usage.cachedTokens > 0) {
			parts.push(`${usage.cachedTokens.toLocaleString()} cached`);
		}
		if (typeof usage.responseTokens === 'number') {
			parts.push(`${usage.responseTokens.toLocaleString()} out`);
		}
		if (typeof usage.thinkingTokens === 'number' && usage.thinkingTokens > 0) {
			parts.push(`${usage.thinkingTokens.toLocaleString()} thinking`);
		}
		if (parts.length === 0 && typeof usage.totalTokens === 'number') {
			parts.push(`${usage.totalTokens.toLocaleString()} total`);
		}
		return parts.length > 0 ? parts.join(' / ') : null;
	}

	function formatCostUsd(costUsd: number): string {
		if (costUsd === 0) {
			return '$0';
		}
		if (costUsd < 0.0001) {
			return `$${costUsd.toFixed(6)}`;
		}
		return `$${costUsd.toFixed(4)}`;
	}

	function setActiveRun(run: ActiveChatRun | null): void {
		activeRun = run;
		activeAssistantId = run?.assistantMessageId ?? null;
		sending = run !== null;
		phase = phaseFromMessages(run);
	}

	function applyRealtimeEvent(event: ChatRealtimeEvent): void {
		if (event.type === 'snapshot') {
			messages = event.chat.messages.map(toChatMessage);
			setActiveRun(event.activeRun);
			return;
		}
		if (event.type === 'message_added') {
			const message = toChatMessage(event.message);
			upsertMessage(message);
			setActiveRun(event.activeRun);
			if (message.role === 'user') {
				pendingScrollMessageId = message.id;
			}
			return;
		}
		if (event.type === 'message_updated') {
			upsertMessage(toChatMessage(event.message));
			setActiveRun(event.activeRun);
			return;
		}
		if (event.type === 'delta') {
			ensureAssistantMessage(event.messageId);
			if (event.channel === 'thought') {
				appendMessageThoughts(event.messageId, event.text);
				if (phase !== 'responding') {
					phase = 'thinking';
				}
			} else {
				appendMessageText(event.messageId, event.text);
				phase = 'responding';
			}
			return;
		}
		if (event.type === 'run_started') {
			setActiveRun(event.activeRun);
			return;
		}
		if (event.type === 'run_finished') {
			setActiveRun(null);
			postController = null;
			return;
		}
		if (event.type === 'chat_error') {
			error = event.message;
			if (event.messageId) {
				updateMessage(event.messageId, { status: 'error' });
			}
		}
	}

	function handleRealtimePayload(raw: string): void {
		try {
			applyRealtimeEvent(JSON.parse(raw) as ChatRealtimeEvent);
		} catch {
			// Ignore malformed realtime messages.
		}
	}

	function connectEventSource(eventsUrl: string): EventSource {
		const source = new EventSource(eventsUrl);
		for (const type of [
			'snapshot',
			'message_added',
			'message_updated',
			'delta',
			'run_started',
			'run_finished',
			'chat_error'
		]) {
			source.addEventListener(type, (event) => {
				handleRealtimePayload((event as MessageEvent).data);
			});
		}
		return source;
	}

	function connectChatEvents(targetChatId: string): () => void {
		const childQuery = activeChildId ? `?child=${encodeURIComponent(activeChildId)}` : '';
		const eventsUrl = resolve(`/api/chat/${targetChatId}/events${childQuery}`);
		const source = connectEventSource(eventsUrl);

		return () => {
			source.close();
		};
	}

	async function sendMessage(): Promise<void> {
		const text = draft.trim();
		if (!text || sending) {
			return;
		}

		draft = '';
		error = null;
		sending = true;
		phase = 'connecting';
		resizeTextarea();

		const controller = new AbortController();
		postController = controller;

		try {
			const response = await fetch(resolve(`/api/chat/${chatId}`), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				signal: controller.signal,
				body: JSON.stringify({ text, activeChildId })
			});
			if (!response.ok) {
				let message = `Request failed with status ${response.status}`;
				try {
					const payload = (await response.json()) as { message?: string };
					message = payload.message ?? message;
				} catch {
					// Keep status message.
				}
				throw new Error(message);
			}
			try {
				const payload = (await response.clone().json()) as {
					snapshot?: ChatSnapshot;
					activeRun?: ActiveChatRun | null;
				};
				if (payload.snapshot) {
					applyRealtimeEvent({ ...payload.snapshot, type: 'snapshot' });
				} else if ('activeRun' in payload) {
					setActiveRun(payload.activeRun ?? null);
				}
			} catch {
				// Realtime streams update normal Durable Object responses.
			}
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') {
				return;
			}
			const message = err instanceof Error ? err.message : 'Unable to reach the chat server.';
			error = message;
			if (!activeRun) {
				sending = false;
				phase = 'idle';
			}
		} finally {
			if (postController === controller) {
				postController = null;
			}
		}
	}

	function updateCardStatus(
		messageId: string,
		cardId: string,
		status: ChatActionCard['status']
	): void {
		messages = messages.map((message) => {
			if (message.id !== messageId || !message.cards) {
				return message;
			}
			return {
				...message,
				cards: message.cards.map((card) => (card.id === cardId ? { ...card, status } : card))
			};
		});
	}

	async function handleCardAction(
		messageId: string,
		card: ChatActionCard,
		action: 'confirm' | 'cancel'
	): Promise<void> {
		if (card.kind === 'open_dashboard') {
			await goto(resolve('/family'));
			return;
		}
		if (action === 'cancel') {
			updateCardStatus(messageId, card.id, 'cancelled');
			cardFeedback = { ...cardFeedback, [card.id]: 'Cancelled.' };
			return;
		}

		updateCardStatus(messageId, card.id, 'confirmed');
		try {
			const response = await fetch(resolve('/api/family/chat-action'), {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, card })
			});
			const payload = (await response.json()) as { message?: string };
			if (!response.ok) {
				throw new Error(payload.message ?? `Request failed with status ${response.status}`);
			}
			cardFeedback = { ...cardFeedback, [card.id]: payload.message ?? 'Done.' };
		} catch (err) {
			updateCardStatus(messageId, card.id, 'error');
			cardFeedback = {
				...cardFeedback,
				[card.id]: err instanceof Error ? err.message : 'Could not complete this action.'
			};
		}
	}

	onMount(() => {
		let lastTouchEnd = 0;
		const preventGestureZoom = (event: Event) => {
			event.preventDefault();
		};
		const preventMultitouchZoom = (event: TouchEvent) => {
			if (event.touches.length > 1) {
				event.preventDefault();
			}
		};
		const preventDoubleTapZoom = (event: TouchEvent) => {
			const now = Date.now();
			if (now - lastTouchEnd < 300) {
				event.preventDefault();
			}
			lastTouchEnd = now;
		};

		document.addEventListener('gesturestart', preventGestureZoom, { passive: false });
		document.addEventListener('gesturechange', preventGestureZoom, { passive: false });
		document.addEventListener('touchmove', preventMultitouchZoom, { passive: false });
		document.addEventListener('touchend', preventDoubleTapZoom, { passive: false });
		textareaRef?.focus();

		return () => {
			document.removeEventListener('gesturestart', preventGestureZoom);
			document.removeEventListener('gesturechange', preventGestureZoom);
			document.removeEventListener('touchmove', preventMultitouchZoom);
			document.removeEventListener('touchend', preventDoubleTapZoom);
		};
	});

	$effect(() => {
		if (data.chatId === loadedChatId) {
			return;
		}
		loadedChatId = data.chatId;
		chatId = data.chatId;
		messages = initialMessages();
		activeRun = data.activeRun;
		sending = data.activeRun !== null;
		activeAssistantId = data.activeRun?.assistantMessageId ?? null;
		phase = phaseFromMessages(data.activeRun);
		draft = '';
		error = null;
		activeChildId = data.familyContext.activeChild?.id ?? null;
		menuOpen = false;
		pendingScrollMessageId = null;
		lastScrollMessageId = null;
	});

	$effect(() => {
		if (!browser || !chatId) {
			return;
		}
		return connectChatEvents(chatId);
	});

	$effect(() => {
		if (typeof draft === 'string') {
			resizeTextarea();
		}
	});

	$effect(() => {
		if (!browser || !composerRef) {
			return;
		}
		const shell = composerRef.closest('.chat-shell') as HTMLElement | null;
		const target = shell ?? document.documentElement;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			const height = entry ? entry.contentRect.height : 0;
			target.style.setProperty('--composer-offset', `${height + 20}px`);
		});
		observer.observe(composerRef);
		return () => {
			observer.disconnect();
			target.style.removeProperty('--composer-offset');
		};
	});

	$effect(() => {
		if (!browser || !pendingScrollMessageId) {
			return;
		}
		const targetId = pendingScrollMessageId;
		if (messages.length === 0) {
			return;
		}
		void tick().then(() => {
			if (lastScrollMessageId === targetId) {
				return;
			}
			requestAnimationFrame(() => {
				const node = document.querySelector(`[data-message-id="${targetId}"]`);
				const container = document.querySelector('.chat-scroll');
				if (!(node instanceof HTMLElement) || !(container instanceof HTMLElement)) {
					return;
				}
				lastScrollMessageId = targetId;
				pendingScrollMessageId = null;
				const nodeRect = node.getBoundingClientRect();
				const containerRect = container.getBoundingClientRect();
				const offset = nodeRect.top - containerRect.top;
				const targetTop = container.scrollTop + offset - 18;
				container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
			});
		});
	});
</script>

<svelte:head>
	<title>Family Spark</title>
	<meta
		name="description"
		content={`Family Spark chat powered by @ljoukov/llm and ${data.chatModel}.`}
	/>
</svelte:head>

<main class={`chat-shell ${hasThread ? 'has-thread' : ''}`}>
	<header class="chat-header">
		<div class="brand">
			<span class="brand-mark" aria-hidden="true"><Sparkles size={18} /></span>
			<div>
				<h1>Family Spark</h1>
				<p>{chatScopeLabel} · {data.chatModel}</p>
			</div>
		</div>
		<div class="header-actions">
			<button
				class="icon-button"
				type="button"
				title="New chat"
				aria-label="New chat"
				onclick={resetConversation}
			>
				<RotateCcw size={18} />
			</button>
			<div class="account-menu">
				<button
					class="avatar-button"
					type="button"
					title="Account menu"
					aria-label="Account menu"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
				>
					{#if data.user?.photoUrl}
						<img src={data.user.photoUrl} alt="" referrerpolicy="no-referrer" />
					{:else}
						<span class="avatar-circle">{avatarLabel}</span>
					{/if}
					<ChevronDown size={15} />
				</button>
				{#if menuOpen}
					<div class="menu-panel">
						<p class="menu-email">{data.user?.email}</p>
						{#if isAdult}
							<a href={resolve('/family')}><Settings size={15} /> Parent dashboard</a>
						{:else}
							<a href={resolve('/family')}><Settings size={15} /> My profile</a>
						{/if}
						{#if isAdult && children.length > 0}
							<div class="menu-section">
								<span>Child profiles</span>
								<a href={resolve(`/${chatId}`)}><Users size={15} /> Family chat</a>
								{#each children as child (child.id)}
									<a href={resolve(`/${chatId}?child=${encodeURIComponent(child.id)}`)}>
										<span class="mini-avatar">{child.displayName.slice(0, 1).toUpperCase()}</span>
										{child.displayName}
									</a>
								{/each}
							</div>
						{/if}
						<a href={resolve('/auth/logout')} data-sveltekit-reload><LogOut size={15} /> Sign out</a
						>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<section class="chat-scroll" aria-label="Conversation">
		{#if error}
			<div class="chat-error" role="alert">
				{error}
			</div>
		{/if}

		{#if messages.length === 0}
			<div class="empty-state">
				<h2>Start with the thing you are trying to figure out.</h2>
				<div class="prompt-row">
					<button
						type="button"
						onclick={() => (draft = 'Plan a focused revision session for tomorrow.')}
					>
						Plan revision
					</button>
					<button
						type="button"
						onclick={() => (draft = 'Help explain a difficult homework problem step by step.')}
					>
						Explain homework
					</button>
					<button
						type="button"
						onclick={() => (draft = 'Turn this messy family schedule into a simple plan.')}
					>
						Make a plan
					</button>
				</div>
			</div>
		{:else}
			<div class="message-list">
				{#each messages as message (message.id)}
					{@const isActive = activeAssistantId === message.id && sending}
					{@const tokenLabel = formatTokenCount(message.usage)}
					<article
						class={`message ${message.role === 'user' ? 'is-user' : 'is-assistant'} ${message.status === 'error' ? 'is-error' : ''}`}
						data-message-id={message.id}
					>
						<span class="sr-only">{message.role === 'user' ? 'You' : 'Family Spark'}</span>
						<div class="message-bubble">
							{#if message.role === 'assistant' && message.status === 'streaming' && message.thoughts.trim().length > 0}
								<div class="thinking-panel">
									<p>Thinking...</p>
									<div>{message.thoughts}</div>
								</div>
							{/if}

							{#if message.text.trim().length > 0}
								<div class="message-text">{message.text}</div>
							{:else if isActive && phase === 'connecting'}
								<p class="message-status">
									<span class="spinner" aria-hidden="true"></span>
									Establishing connection...
								</p>
							{:else if isActive && phase === 'thinking'}
								<p class="message-status">
									<span class="spinner" aria-hidden="true"></span>
									Thinking...
								</p>
							{:else if isActive}
								<p class="message-status">
									<span class="spinner" aria-hidden="true"></span>
									Writing...
								</p>
							{:else}
								<p class="message-placeholder">...</p>
							{/if}

							{#if message.cards?.length}
								<div class="action-cards">
									{#each message.cards as card (card.id)}
										<section class={`action-card status-${card.status}`} aria-label={card.title}>
											<div>
												<strong>{card.title}</strong>
												<p>{card.body}</p>
											</div>
											{#if cardFeedback[card.id]}
												<p class="card-feedback">{cardFeedback[card.id]}</p>
											{/if}
											<div class="card-actions">
												{#if card.kind === 'open_dashboard'}
													<a href={resolve('/family')}>Open dashboard</a>
												{:else}
													<button
														type="button"
														disabled={card.status !== 'pending'}
														onclick={() => void handleCardAction(message.id, card, 'confirm')}
													>
														{card.confirmLabel ?? 'Confirm'}
													</button>
													<button
														class="secondary"
														type="button"
														disabled={card.status !== 'pending'}
														onclick={() => void handleCardAction(message.id, card, 'cancel')}
													>
														{card.cancelLabel ?? 'Cancel'}
													</button>
												{/if}
											</div>
										</section>
									{/each}
								</div>
							{/if}

							{#if message.role === 'assistant' && (message.modelVersion || tokenLabel || message.costUsd)}
								<p class="message-meta">
									{message.modelVersion ?? 'model'}
									{#if tokenLabel}
										<span>{tokenLabel}</span>
									{/if}
									{#if typeof message.costUsd === 'number'}
										<span>{formatCostUsd(message.costUsd)}</span>
									{/if}
								</p>
							{/if}
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</section>

	<div class="composer-wrap" bind:this={composerRef}>
		<div class="composer">
			<textarea
				bind:this={textareaRef}
				value={draft}
				oninput={handleComposerInput}
				onkeydown={handleComposerKeydown}
				disabled={sending}
				rows="1"
				maxlength={MAX_COMPOSER_CHARS}
				placeholder="Ask anything"
				aria-label="Message Family Spark"
			></textarea>
			<button
				class="send-button"
				type="button"
				title={sending ? 'Stop response' : 'Send message'}
				aria-label={sending ? 'Stop response' : 'Send message'}
				disabled={!sending && !canSend}
				onclick={sending ? stopResponse : () => void sendMessage()}
			>
				{#if sending}
					<Square size={15} fill="currentColor" />
				{:else}
					<ArrowUp size={18} />
				{/if}
			</button>
		</div>
	</div>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(:root) {
		--app-viewport-height: 100vh;
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

	:global(button),
	:global(textarea) {
		font: inherit;
	}

	.chat-shell {
		--composer-offset: 7rem;
		--last-message-min-height: max(
			14rem,
			calc(var(--app-viewport-height, 100vh) - var(--composer-offset) - 8.5rem)
		);
		position: fixed;
		inset: 0;
		height: var(--app-viewport-height, 100vh);
		min-height: var(--app-viewport-height, 100vh);
		width: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		overflow: hidden;
		overscroll-behavior: none;
		touch-action: manipulation;
		background:
			linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 250, 249, 0.96)),
			radial-gradient(circle at 18% 12%, rgba(41, 151, 128, 0.12), transparent 30rem),
			radial-gradient(circle at 82% 0%, rgba(192, 119, 56, 0.1), transparent 26rem);
	}

	.chat-header {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.9rem clamp(1rem, 4vw, 2rem);
		border-bottom: 1px solid rgba(35, 45, 42, 0.1);
		background: rgba(248, 250, 249, 0.86);
		backdrop-filter: blur(18px);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.7rem;
		min-width: 0;
	}

	.brand-mark {
		display: grid;
		place-items: center;
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.55rem;
		background: #183c34;
		color: #f8faf9;
		box-shadow: 0 16px 32px -24px rgba(24, 60, 52, 0.7);
		flex: 0 0 auto;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		font-size: 1rem;
		line-height: 1.2;
		font-weight: 680;
	}

	.brand p {
		margin-top: 0.15rem;
		color: rgba(20, 24, 23, 0.58);
		font-size: 0.78rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.55rem;
		min-width: 0;
	}

	.account-menu {
		position: relative;
	}

	.avatar-button {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		min-height: 2.25rem;
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.78);
		padding: 0.18rem 0.5rem 0.18rem 0.18rem;
		color: #28322f;
		cursor: pointer;
	}

	.avatar-button img,
	.avatar-circle {
		width: 1.85rem;
		height: 1.85rem;
		border-radius: 999px;
		flex: 0 0 auto;
	}

	.avatar-button img {
		display: block;
		object-fit: cover;
	}

	.avatar-circle,
	.mini-avatar {
		display: grid;
		place-items: center;
		background: #183c34;
		color: #ffffff;
		font-weight: 760;
	}

	.menu-panel {
		position: absolute;
		right: 0;
		top: calc(100% + 0.5rem);
		width: min(18rem, calc(100vw - 1.5rem));
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 0.5rem;
		background: #ffffff;
		box-shadow: 0 24px 54px -38px rgba(28, 34, 31, 0.58);
		padding: 0.45rem;
	}

	.menu-email,
	.menu-section > span {
		display: block;
		padding: 0.55rem 0.6rem;
		color: rgba(20, 24, 23, 0.52);
		font-size: 0.76rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.menu-section {
		margin: 0.25rem 0;
		border-top: 1px solid rgba(35, 45, 42, 0.08);
		border-bottom: 1px solid rgba(35, 45, 42, 0.08);
		padding: 0.25rem 0;
	}

	.menu-panel a {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 0.4rem;
		padding: 0.6rem;
		color: #1c2825;
		text-decoration: none;
		font-size: 0.9rem;
	}

	.menu-panel a:hover {
		background: #eef5f2;
	}

	.mini-avatar {
		width: 1.45rem;
		height: 1.45rem;
		border-radius: 999px;
		font-size: 0.7rem;
	}

	.icon-button,
	.send-button {
		display: grid;
		place-items: center;
		border: 1px solid rgba(35, 45, 42, 0.12);
		cursor: pointer;
		transition:
			background 0.16s ease,
			border-color 0.16s ease,
			transform 0.16s ease;
	}

	.icon-button {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 0.55rem;
		background: rgba(255, 255, 255, 0.72);
		color: #28322f;
	}

	.icon-button:hover,
	.prompt-row button:hover {
		background: #ffffff;
		border-color: rgba(41, 151, 128, 0.34);
		transform: translateY(-1px);
	}

	.chat-scroll {
		min-height: 0;
		overflow-y: auto;
		padding: clamp(1rem, 4vw, 2rem);
		scrollbar-width: thin;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-y;
	}

	.chat-error {
		width: min(48rem, 100%);
		margin: 0 auto 1rem;
		padding: 0.75rem 0.9rem;
		border: 1px solid rgba(178, 63, 63, 0.22);
		border-radius: 0.5rem;
		background: #fff4f1;
		color: #8b2d28;
	}

	.empty-state {
		width: min(50rem, 100%);
		min-height: calc(var(--app-viewport-height, 100vh) - 13rem);
		margin: 0 auto;
		display: grid;
		align-content: center;
		gap: 1.1rem;
		text-align: center;
	}

	.empty-state h2 {
		font-size: clamp(1.8rem, 5vw, 3.25rem);
		line-height: 1.04;
		font-weight: 720;
		color: #121716;
	}

	.prompt-row {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.55rem;
	}

	.prompt-row button {
		border: 1px solid rgba(35, 45, 42, 0.12);
		border-radius: 999px;
		background: rgba(255, 255, 255, 0.78);
		color: rgba(20, 24, 23, 0.72);
		padding: 0.5rem 0.8rem;
		cursor: pointer;
	}

	.message-list {
		width: min(54rem, 100%);
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding-bottom: calc(var(--composer-offset) + env(safe-area-inset-bottom, 0px));
	}

	.message {
		display: flex;
		align-items: flex-start;
		width: 100%;
	}

	.message-list > .message.is-assistant:last-child {
		min-height: var(--last-message-min-height);
	}

	.message.is-user {
		justify-content: flex-end;
	}

	.message.is-assistant {
		justify-content: flex-start;
	}

	.message-bubble {
		max-width: min(46rem, 100%);
		border: 1px solid rgba(35, 45, 42, 0.11);
		box-shadow: 0 18px 46px -34px rgba(28, 34, 31, 0.38);
	}

	.message.is-user .message-bubble {
		width: auto;
		border-radius: 1.15rem 1.15rem 0.35rem 1.15rem;
		background: #183c34;
		color: #ffffff;
		padding: 0.7rem 0.9rem;
	}

	.message.is-assistant .message-bubble {
		width: min(46rem, 100%);
		border-radius: 1rem;
		background: rgba(255, 255, 255, 0.86);
		color: #141817;
		padding: 0.9rem 1rem;
	}

	.message.is-error .message-bubble {
		border-color: rgba(178, 63, 63, 0.24);
		background: #fff7f5;
		color: #8b2d28;
	}

	.message-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.58;
		font-size: 0.98rem;
	}

	.thinking-panel {
		border-radius: 0.7rem;
		border: 1px solid rgba(41, 151, 128, 0.18);
		background: rgba(239, 248, 245, 0.82);
		padding: 0.62rem 0.72rem;
		margin-bottom: 0.75rem;
	}

	.thinking-panel p {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		color: rgba(24, 60, 52, 0.68);
	}

	.thinking-panel div {
		margin-top: 0.35rem;
		max-height: 6.5rem;
		overflow: hidden;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		color: rgba(20, 24, 23, 0.66);
		font-size: 0.82rem;
		line-height: 1.45;
	}

	.message-status {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		color: rgba(20, 24, 23, 0.62);
	}

	.spinner {
		width: 0.9rem;
		height: 0.9rem;
		border-radius: 999px;
		border: 2px solid rgba(41, 151, 128, 0.18);
		border-top-color: #299780;
		animation: spin 0.8s linear infinite;
		flex: 0 0 auto;
	}

	.message-placeholder {
		color: rgba(20, 24, 23, 0.48);
	}

	.action-cards {
		display: grid;
		gap: 0.65rem;
		margin-top: 0.85rem;
	}

	.action-card {
		display: grid;
		gap: 0.7rem;
		border: 1px solid rgba(41, 151, 128, 0.18);
		border-radius: 0.55rem;
		background: #f7fbf9;
		padding: 0.8rem;
	}

	.action-card strong {
		display: block;
		color: #13211d;
		font-size: 0.96rem;
	}

	.action-card p {
		margin-top: 0.25rem;
		color: rgba(20, 24, 23, 0.66);
		line-height: 1.45;
		font-size: 0.9rem;
	}

	.action-card.status-confirmed {
		border-color: rgba(41, 151, 128, 0.34);
	}

	.action-card.status-cancelled,
	.action-card.status-error {
		border-color: rgba(178, 63, 63, 0.22);
		background: #fff8f6;
	}

	.card-feedback {
		margin: 0;
		font-weight: 650;
	}

	.card-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.card-actions button,
	.card-actions a {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 2.35rem;
		border: 1px solid #183c34;
		border-radius: 0.5rem;
		background: #183c34;
		color: #ffffff;
		padding: 0 0.8rem;
		text-decoration: none;
		font: inherit;
		font-weight: 700;
		cursor: pointer;
	}

	.card-actions button.secondary {
		background: #ffffff;
		color: #25312e;
		border-color: rgba(35, 45, 42, 0.14);
	}

	.card-actions button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.message-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
		margin-top: 0.75rem;
		color: rgba(20, 24, 23, 0.46);
		font-size: 0.72rem;
	}

	.message-meta span::before {
		content: '·';
		margin-right: 0.45rem;
	}

	.composer-wrap {
		position: fixed;
		left: 50%;
		bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
		transform: translateX(-50%);
		z-index: 4;
		width: min(54rem, calc(100% - clamp(2rem, 8vw, 4rem)));
		margin: 0;
	}

	.composer {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 0.65rem;
		padding: 0.65rem;
		border: 1px solid rgba(35, 45, 42, 0.13);
		border-radius: 0.85rem;
		background: rgba(255, 255, 255, 0.9);
		backdrop-filter: blur(18px);
		box-shadow: 0 22px 60px -42px rgba(28, 34, 31, 0.55);
	}

	textarea {
		width: 100%;
		min-height: 2.25rem;
		max-height: 18rem;
		resize: none;
		border: 0;
		background: transparent;
		color: #141817;
		padding: 0.4rem 0.2rem;
		line-height: 1.5rem;
		outline: none;
		overscroll-behavior: contain;
		-webkit-overflow-scrolling: touch;
		touch-action: pan-y;
	}

	textarea::placeholder {
		color: rgba(20, 24, 23, 0.44);
	}

	.send-button {
		width: 2.35rem;
		height: 2.35rem;
		border-radius: 999px;
		background: #183c34;
		color: #ffffff;
	}

	.send-button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.send-button:not(:disabled):hover {
		background: #245a4f;
		transform: translateY(-1px);
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@supports (height: -webkit-fill-available) {
		:global(:root) {
			--app-viewport-height: -webkit-fill-available;
		}

		:global(html) {
			min-height: -webkit-fill-available;
		}
	}

	@supports (height: 100dvh) {
		:global(:root) {
			--app-viewport-height: 100dvh;
		}
	}

	@media (max-width: 640px) {
		.chat-shell {
			--last-message-min-height: max(
				12rem,
				calc(var(--app-viewport-height, 100vh) - var(--composer-offset) - 7rem)
			);
		}

		.chat-header {
			padding-inline: 0.85rem;
			gap: 0.7rem;
		}

		.header-actions {
			gap: 0.4rem;
		}

		.menu-panel {
			right: -0.2rem;
		}

		.chat-scroll {
			padding: 0.85rem;
		}

		.message.is-assistant .message-bubble,
		.message-bubble {
			max-width: 100%;
		}

		.composer-wrap {
			width: calc(100% - 1rem);
			bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
		}

		.empty-state {
			min-height: calc(var(--app-viewport-height, 100vh) - 11rem);
			text-align: left;
		}

		.prompt-row {
			justify-content: flex-start;
		}
	}
</style>
