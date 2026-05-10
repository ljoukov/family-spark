#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { generateText } from '@ljoukov/llm';

const rootDir = process.cwd();
const defaultPrompt = 'Why do ionic compounds conduct electricity when molten but not when solid?';

function loadDotEnv(filePath) {
	if (!fs.existsSync(filePath)) {
		return;
	}

	for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/u)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#') || !line.includes('=')) {
			continue;
		}
		const index = line.indexOf('=');
		const key = line.slice(0, index).trim();
		const value = line.slice(index + 1).trim();
		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

function findConstInitializer(sourceFile, name) {
	let match = null;
	function visit(node) {
		if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
			match = node.initializer;
			return;
		}
		ts.forEachChild(node, visit);
	}
	visit(sourceFile);
	if (!match) {
		throw new Error(`Could not find ${name}.`);
	}
	return match;
}

function readSource(relativePath) {
	const absolutePath = path.join(rootDir, relativePath);
	return ts.createSourceFile(
		absolutePath,
		fs.readFileSync(absolutePath, 'utf8'),
		ts.ScriptTarget.Latest,
		true,
		ts.ScriptKind.TS
	);
}

function readStringConst(sourceFile, name) {
	let initializer = findConstInitializer(sourceFile, name);
	while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)) {
		initializer = initializer.expression;
	}
	if (!ts.isStringLiteralLike(initializer)) {
		throw new Error(`${name} must be a string literal.`);
	}
	return initializer.text;
}

function readJoinedStringArrayConst(sourceFile, name) {
	const initializer = findConstInitializer(sourceFile, name);
	if (
		!ts.isCallExpression(initializer) ||
		!ts.isPropertyAccessExpression(initializer.expression) ||
		initializer.expression.name.text !== 'join' ||
		!ts.isArrayLiteralExpression(initializer.expression.expression)
	) {
		throw new Error(`${name} must be a string array joined with .join().`);
	}

	const [separatorNode] = initializer.arguments;
	const separator = ts.isStringLiteralLike(separatorNode) ? separatorNode.text : '';
	return initializer.expression.expression.elements
		.map((element) => {
			if (!ts.isStringLiteralLike(element)) {
				throw new Error(`${name} contains a non-string array element.`);
			}
			return element.text;
		})
		.join(separator);
}

function parseArgs(argv) {
	const args = [...argv];
	let context = '';
	const promptParts = [];

	while (args.length > 0) {
		const arg = args.shift();
		if (arg === '--context') {
			context = args.shift() ?? '';
			continue;
		}
		if (arg === '--help' || arg === '-h') {
			console.log('Usage: npm run test:prompt -- [--context "..."] "question"');
			process.exit(0);
		}
		promptParts.push(arg);
	}

	return {
		context,
		prompt: promptParts.join(' ').trim() || defaultPrompt
	};
}

loadDotEnv(path.join(rootDir, '.env.local'));
loadDotEnv(path.join(rootDir, '.env'));

const chatTypes = readSource('src/lib/server/chat-types.ts');
const chatModel = readSource('src/lib/server/chat-model.ts');
const systemPrompt = readJoinedStringArrayConst(chatTypes, 'SYSTEM_PROMPT');
const model = readStringConst(chatModel, 'OPENAI_CHAT_MODEL');
const thinkingLevel = readStringConst(chatModel, 'CHAT_THINKING_LEVEL');
const { context, prompt } = parseArgs(process.argv.slice(2));
const instructions = context ? `${systemPrompt}\n\n${context}` : systemPrompt;

console.log(`Model: ${model}`);
console.log(`Thinking: ${thinkingLevel}`);
console.log(`Prompt: ${prompt}`);
if (context) {
	console.log(`Context: ${context}`);
}
console.log('\n--- response ---\n');

const result = await generateText({
	model,
	thinkingLevel,
	instructions,
	input: prompt
});

console.log(result.text.trim());
console.log('\n--- metadata ---');
console.log(`Model version: ${result.modelVersion}`);
console.log(`Cost USD: ${result.costUsd}`);
