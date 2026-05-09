<script lang="ts">
	import { browser } from '$app/environment';
	import { createChatId } from '$lib/chat-ids';

	if (browser) {
		location.replace(`/${createChatId()}`);
	}
</script>
