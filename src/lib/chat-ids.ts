const BASE64_URL_ALPHABET =
	'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.split('');

export const CHAT_ID_LENGTH = 12;
export const CHAT_ID_PATTERN = /^[A-Za-z0-9]{12}$/u;

function base64UrlEncode(bytes: Uint8Array): string {
	let base64 = '';
	let groupPos = 0;
	let previous = 0;

	for (const byte of bytes) {
		switch (groupPos) {
			case 0:
				base64 += BASE64_URL_ALPHABET[byte >> 2];
				previous = (byte & 3) << 4;
				groupPos = 1;
				break;
			case 1:
				base64 += BASE64_URL_ALPHABET[previous | (byte >> 4)];
				previous = (byte & 15) << 2;
				groupPos = 2;
				break;
			case 2:
				base64 += BASE64_URL_ALPHABET[previous | (byte >> 6)];
				base64 += BASE64_URL_ALPHABET[byte & 63];
				groupPos = 0;
				break;
		}
	}

	if (groupPos) {
		base64 += BASE64_URL_ALPHABET[previous];
		base64 += '.';
		if (groupPos === 1) {
			base64 += '.';
		}
	}

	return base64;
}

export function isChatId(value: unknown): value is string {
	return typeof value === 'string' && CHAT_ID_PATTERN.test(value);
}

export function createChatId(): string {
	const bytes = new Uint8Array(CHAT_ID_LENGTH + 8);
	crypto.getRandomValues(bytes);
	return base64UrlEncode(bytes)
		.replaceAll('-', '')
		.replaceAll('_', '')
		.replaceAll('.', '')
		.slice(0, CHAT_ID_LENGTH);
}
