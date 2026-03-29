import * as vscode from 'vscode';
import { fixProjectCommand } from './commands/fixProject';
import { generateFromIntentCommand, runAndHealCommand, clearMemoryCommand } from './commands/generateFromIntent';
import {
 fixSelectionCommand,
 refactorFileCommand,
 generateTestsCommand,
} from './commands/codeCommands';
import { AgentSidebarProvider, AgentPanel } from './panels/agentPanel';
import { globalEventBus } from './utils/eventBus';

export function activate(context: vscode.ExtensionContext): void {
 console.log('AutoDev Agent: Activated');

 const eventBus = globalEventBus;

 //  Register sidebar provider 
 const sidebarProvider = new AgentSidebarProvider(context.extensionUri, eventBus);
 context.subscriptions.push(
 vscode.window.registerWebviewViewProvider(
 AgentSidebarProvider.viewType,
 sidebarProvider,
 { webviewOptions: { retainContextWhenHidden: true } }
 )
 );

 //  Register commands 
 const commands: [string, () => Promise<void>][] = [
 ['autodev.fixProject', () => fixProjectCommand(eventBus)],
 ['autodev.generateFromIntent', () => generateFromIntentCommand(eventBus)],
 ['autodev.fixSelection', () => fixSelectionCommand(eventBus)],
 ['autodev.refactorFile', () => refactorFileCommand(eventBus)],
 ['autodev.writTests', () => generateTestsCommand(eventBus)],
 ['autodev.runAndHeal', () => runAndHealCommand(eventBus)],
 ['autodev.clearMemory', async () => { clearMemoryCommand(); }],
 [
 'autodev.openPanel',
 async () => AgentPanel.createOrShow(context.extensionUri, eventBus),
 ],
 [
 'autodev.configureProvider',
 async () => {
 const choice = await vscode.window.showQuickPick(
 [
 { label: '$(server) Ollama', description: 'Free, Private, Local - no API key needed', value: 'ollama' },
 { label: '$(cloud) Google Gemini', description: 'Free tier 1500 req/day - aistudio.google.com', value: 'gemini' },
 { label: '$(star) Anthropic Claude', description: 'Best code quality - console.anthropic.com', value: 'anthropic' },
 { label: '$(lightning-bolt) Groq', description: 'Free tier, 10x faster - console.groq.com', value: 'groq' },
 { label: '$(globe) OpenAI', description: 'GPT-4o, paid - platform.openai.com', value: 'openai' },
 { label: '$(plug) OpenAI-compatible', description: 'LM Studio, LocalAI, any custom endpoint', value: 'openai-compatible' },
 ],
 { placeHolder: 'Select LLM provider' }
 );
 if (!choice) return;

 const cfg = vscode.workspace.getConfiguration('autodev');
 await cfg.update('provider', choice.value, vscode.ConfigurationTarget.Global);

 // Provider-specific setup wizards
 if (choice.value === 'ollama') {
 const model = await vscode.window.showInputBox({
 prompt: 'Ollama model name',
 value: 'qwen2.5-coder:7b',
 placeHolder: 'qwen2.5-coder:7b | codellama:7b | mistral:7b | phi3:mini',
 ignoreFocusOut: true,
 });
 if (model) await cfg.update('ollamaModel', model, vscode.ConfigurationTarget.Global);
 vscode.window.showInformationMessage(`AutoDev: Ollama selected (${model}). Make sure it is running: ollama serve`);

 } else if (choice.value === 'gemini') {
 const key = await vscode.window.showInputBox({ prompt: 'Gemini API key (free at aistudio.google.com)', placeHolder: 'AIza...', password: true, ignoreFocusOut: true });
 if (key) await cfg.update('geminiApiKey', key, vscode.ConfigurationTarget.Global);
 vscode.window.showInformationMessage('AutoDev: Gemini configured. Free tier: 1500 requests/day.');

 } else if (choice.value === 'anthropic') {
 const key = await vscode.window.showInputBox({ prompt: 'Anthropic API key (console.anthropic.com)', placeHolder: 'sk-ant-...', password: true, ignoreFocusOut: true });
 if (key) await cfg.update('anthropicApiKey', key, vscode.ConfigurationTarget.Global);
 const model = await vscode.window.showQuickPick(
 [
 { label: 'claude-3-5-haiku-20241022', description: 'Fastest, cheapest', value: 'claude-3-5-haiku-20241022' },
 { label: 'claude-3-5-sonnet-20241022', description: 'Balanced quality/speed', value: 'claude-3-5-sonnet-20241022' },
 { label: 'claude-opus-4-5', description: 'Best quality, higher cost', value: 'claude-opus-4-5' },
 ],
 { placeHolder: 'Select Claude model' }
 );
 if (model) await cfg.update('anthropicModel', model.value, vscode.ConfigurationTarget.Global);
 vscode.window.showInformationMessage(`AutoDev: Anthropic Claude configured (${model?.label ?? 'haiku'}).`);

 } else if (choice.value === 'groq') {
 const key = await vscode.window.showInputBox({ prompt: 'Groq API key (free at console.groq.com)', placeHolder: 'gsk_...', password: true, ignoreFocusOut: true });
 if (key) await cfg.update('groqApiKey', key, vscode.ConfigurationTarget.Global);
 const model = await vscode.window.showQuickPick(
 [
 { label: 'llama-3.3-70b-versatile', description: 'Best quality on Groq', value: 'llama-3.3-70b-versatile' },
 { label: 'llama-3.1-8b-instant', description: 'Ultra fast responses', value: 'llama-3.1-8b-instant' },
 { label: 'mixtral-8x7b-32768', description: 'Good balance', value: 'mixtral-8x7b-32768' },
 { label: 'gemma2-9b-it', description: 'Lightweight, fast', value: 'gemma2-9b-it' },
 ],
 { placeHolder: 'Select Groq model' }
 );
 if (model) await cfg.update('groqModel', model.value, vscode.ConfigurationTarget.Global);
 vscode.window.showInformationMessage(`AutoDev: Groq configured (${model?.label ?? 'llama-3.3-70b'}). Fastest free provider.`);

 } else if (choice.value === 'openai') {
 const key = await vscode.window.showInputBox({ prompt: 'OpenAI API key (platform.openai.com)', placeHolder: 'sk-...', password: true, ignoreFocusOut: true });
 if (key) await cfg.update('openaiApiKey', key, vscode.ConfigurationTarget.Global);
 const model = await vscode.window.showQuickPick(
 [
 { label: 'gpt-4o-mini', description: 'Fast, cheap, recommended', value: 'gpt-4o-mini' },
 { label: 'gpt-4o', description: 'Best quality', value: 'gpt-4o' },
 { label: 'gpt-4-turbo', description: 'Powerful', value: 'gpt-4-turbo' },
 { label: 'gpt-3.5-turbo', description: 'Cheapest', value: 'gpt-3.5-turbo' },
 ],
 { placeHolder: 'Select OpenAI model' }
 );
 if (model) await cfg.update('openaiModel', model.value, vscode.ConfigurationTarget.Global);
 vscode.window.showInformationMessage(`AutoDev: OpenAI configured (${model?.label ?? 'gpt-4o-mini'}).`);

 } else if (choice.value === 'openai-compatible') {
 const url = await vscode.window.showInputBox({ prompt: 'API base URL', value: 'http://localhost:1234/v1', ignoreFocusOut: true });
 if (url) await cfg.update('openaiCompatibleUrl', url, vscode.ConfigurationTarget.Global);
 const key = await vscode.window.showInputBox({ prompt: 'API key (type "local" if none required)', value: 'local', ignoreFocusOut: true });
 if (key) await cfg.update('openaiCompatibleKey', key, vscode.ConfigurationTarget.Global);
 const model = await vscode.window.showInputBox({ prompt: 'Model name', placeHolder: 'local-model', ignoreFocusOut: true });
 if (model) await cfg.update('openaiCompatibleModel', model, vscode.ConfigurationTarget.Global);
 vscode.window.showInformationMessage(`AutoDev: Custom endpoint configured (${url}).`);
 }
 },
 ],
 ];

 for (const [id, handler] of commands) {
 context.subscriptions.push(
 vscode.commands.registerCommand(id, async (...args: unknown[]) => {
 try {
 // Pass any string arg (e.g. prefilled intent) to generate command
 if (id === 'autodev.generateFromIntent' && typeof args[0] === 'string') {
 await generateFromIntentCommand(eventBus, args[0]);
 } else {
 await handler();
 }
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 vscode.window.showErrorMessage(`AutoDev Error: ${msg}`);
 eventBus.emit({ type: 'error', message: msg, timestamp: Date.now() });
 }
 })
 );
 }

 //  First-run welcome 
 const hasShownWelcome = context.globalState.get<boolean>('autodev.welcomeShown');
 if (!hasShownWelcome) {
 context.globalState.update('autodev.welcomeShown', true);
 vscode.window
 .showInformationMessage(
 'AutoDev Agent is ready! Configure your LLM provider to get started.',
 'Configure Provider',
 'Open Panel',
 'Dismiss')
 .then(choice => {
 if (choice === 'Configure Provider') {
 vscode.commands.executeCommand('autodev.configureProvider');
 } else if (choice === 'Open Panel') {
 vscode.commands.executeCommand('autodev.openPanel');
 }
 });
 }

 //  Status bar item 
 const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
 statusBar.text = 'AutoDev';
 statusBar.tooltip = 'AutoDev Agent - Click to open panel';
 statusBar.command = 'autodev.openPanel';
 statusBar.show();
 context.subscriptions.push(statusBar);

 // Update status bar on config change
 eventBus.on(event => {
 if (event.type === 'progress') {
 statusBar.text = '$(loading~spin) AutoDev';
 } else if (event.type === 'complete' || event.type === 'error') {
 statusBar.text = 'AutoDev';
 }
 });
}

export function deactivate(): void {
 console.log('AutoDev Agent: Deactivated');
}
