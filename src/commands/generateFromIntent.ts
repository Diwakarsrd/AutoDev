import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LLMProvider } from '../providers/llmProvider';
import { PlannerAgent } from '../agents/plannerAgent';
import { ExecutorAgent } from '../agents/executorAgent';
import { ValidatorAgent } from '../agents/validatorAgent';
import { FileUtils } from '../utils/fileUtils';
import { AgentEventBus } from '../utils/eventBus';
import { getGlobalMemory, resetGlobalMemory } from '../utils/conversationMemory';
import { getGlobalHealer, resetGlobalHealer } from '../utils/selfHealingLoop';

export async function generateFromIntentCommand(
 eventBus: AgentEventBus,
 prefillIntent?: string
): Promise<void> {
 const workspaceRoot = FileUtils.getWorkspaceRoot();
 if (!workspaceRoot) {
 vscode.window.showErrorMessage('AutoDev: Open a workspace folder first');
 return;
 }

 const cfg = vscode.workspace.getConfiguration('autodev');
 const memoryEnabled = cfg.get('conversationMemoryEnabled', true);
 const healingEnabled = cfg.get('selfHealingEnabled', true);
 const maxRetries = cfg.get('selfHealingMaxRetries', 3);
 const maxTurns = cfg.get('conversationMemoryMaxTurns', 10);

 const memory = getGlobalMemory(memoryEnabled, maxTurns);
 const healer = getGlobalHealer(healingEnabled, maxRetries);

 // Build smart prompt - include memory context if available
 const lastIntent = memory.getLastIntent();
 const placeHolder = lastIntent
 ? `Last: "${lastIntent}" - or type something new`
 : 'e.g. Build REST API with JWT auth and PostgreSQL';

 const intent = await vscode.window.showInputBox({
 prompt: memoryEnabled && lastIntent
 ? `What next? (Memory: ${memory.getSummary()})`
 : 'What do you want to build?',
 placeHolder,
 value: prefillIntent ?? '',
 ignoreFocusOut: true,
 });

 if (!intent?.trim()) return;

 await vscode.window.withProgress(
 {
 location: vscode.ProgressLocation.Notification,
 title: 'AutoDev: Generating...',
 cancellable: true,
 },
 async (progress, token) => {
 const emit = (msg: string) => {
 progress.report({ message: msg });
 eventBus.emit({ type: 'progress', message: msg, timestamp: Date.now() });
 };

 try {
 const llm = LLMProvider.fromVSCodeConfig();
 const planner = new PlannerAgent(llm);
 const executor = new ExecutorAgent(workspaceRoot);
 const validator = new ValidatorAgent(llm);

 // Step 1: Scan workspace for context
 emit('Scanning workspace for context...');
 const files = await FileUtils.scanWorkspace(workspaceRoot, cfg.get('excludePatterns', []), 20, undefined);
 const context = FileUtils.buildWorkspaceContext(files);

 // Step 2: Record intent in memory
 memory.addUserMessage(intent, context.slice(0, 200));

 // Step 3: Plan (memory-aware context)
 if (token.isCancellationRequested) return;
 emit(`Planner Agent: Creating plan${memoryEnabled && memory.getLastIntent() ? ' (using session memory)' : ''}...`);
 const plan = await planner.createPlan(intent, context, emit, memory);

 // Step 4: Validate
 const planValidation = await validator.validatePlan(plan);
 if (planValidation.warnings.length > 0) {
 emit(`[Warning] Warnings: ${planValidation.warnings.join('; ')}`);
 }

 // Step 5: Confirm
 if (token.isCancellationRequested) return;
 const confirmed = await showPlanConfirmation(plan, healingEnabled, memoryEnabled);
 if (!confirmed) { emit('Cancelled by user'); return; }

 // Step 6: Execute
 emit('Executor Agent: Running plan...');
 const result = await executor.executePlan(plan, emit);

 if (!result.success) {
 vscode.window.showErrorMessage(`AutoDev: Execution failed - ${result.error}`);
 return;
 }

 const fileCount = result.filesChanged?.length ?? 0;

 // Step 7: Record what was created in memory
 result.filesChanged?.forEach(f => memory.recordFileModified(f.filePath));
 memory.setLastIntent(intent, `${fileCount} file(s): ${plan.steps.map(s => s.target).slice(0, 3).join(', ')}`);
 memory.addAssistantMessage(`Completed: ${intent}. Created ${fileCount} file(s).`);

 // Step 8: Self-healing - run the project and fix any errors
 if (healingEnabled && result.filesChanged && result.filesChanged.length > 0) {
 const runCmd = detectRunCommand(workspaceRoot, plan.techStack);
 if (runCmd) {
 emit(`Self-healing: running \`${runCmd}\` to check for errors...`);
 const mainFile = result.filesChanged.find(f =>
 f.filePath.includes('index') || f.filePath.includes('main') || f.filePath.includes('app')
 );
 if (mainFile) {
 const healResult = await healer.runAndHeal(
 runCmd, mainFile.filePath, workspaceRoot, llm, eventBus
 );
 if (healResult.healed) {
 emit(`Self-healing fixed ${healResult.attempts.length} error(s) automatically`);
 }
 }
 }
 }

 emit(`Done! ${fileCount} file(s) created/modified`);

 vscode.window.showInformationMessage(
 `AutoDev: "${intent}" - ${fileCount} file(s) in ${plan.estimatedTime}`,
 'Open Output');

 eventBus.emit({
 type: 'complete',
 message: `Generated: ${intent}`,
 data: { filesChanged: result.filesChanged },
 timestamp: Date.now(),
 });

 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 emit(`Error: ${msg}`);
 vscode.window.showErrorMessage(`AutoDev Error: ${msg}`);
 eventBus.emit({ type: 'error', message: msg, timestamp: Date.now() });
 }
 }
 );
}

// Detect the right command to run based on tech stack
function detectRunCommand(workspaceRoot: string, techStack: string[]): string | null {
 const stack = (techStack ?? []).map(s => s.toLowerCase()).join(' ');

 if (fs.existsSync(path.join(workspaceRoot, 'package.json'))) {
 const pkg = JSON.parse(fs.readFileSync(path.join(workspaceRoot, 'package.json'), 'utf-8'));
 if (pkg.scripts?.test) return 'npm test';
 if (pkg.scripts?.build) return 'npm run build';
 if (pkg.scripts?.start) return 'npm start';
 }
 if (fs.existsSync(path.join(workspaceRoot, 'tsconfig.json'))) return 'npx tsc --noEmit';
 if (stack.includes('python') && fs.existsSync(path.join(workspaceRoot, 'main.py'))) return 'python main.py';
 if (stack.includes('go') && fs.existsSync(path.join(workspaceRoot, 'main.go'))) return 'go build ./...';
 if (stack.includes('rust') && fs.existsSync(path.join(workspaceRoot, 'Cargo.toml'))) return 'cargo check';
 return null;
}

async function showPlanConfirmation(
 plan: import('../types').AgentPlan,
 healingEnabled: boolean,
 memoryEnabled: boolean
): Promise<boolean> {
 const stepList = plan.steps.slice(0, 8).map(s => `${s.stepNumber}. ${s.action.replace('_', ' ')}: ${s.target}`).join('\n');
 const extra = plan.steps.length > 8 ? `\n... and ${plan.steps.length - 8} more steps` : '';
 const features = [
 healingEnabled ? 'Self-healing ON' : 'Self-healing OFF',
 memoryEnabled ? 'Memory ON' : 'Memory OFF',
 ].join(', ');

 const result = await vscode.window.showInformationMessage(
 `AutoDev Plan: ${plan.intent}\n\nStack: ${plan.techStack?.join(', ')}\nTime: ${plan.estimatedTime}\n${features}\n\n${stepList}${extra}`,
 { modal: true },
 'Execute Plan',
 'Cancel');
 return result === 'Execute Plan';
}

//  Run & Heal command - run any command with self-healing 
export async function runAndHealCommand(eventBus: AgentEventBus): Promise<void> {
 const workspaceRoot = FileUtils.getWorkspaceRoot();
 if (!workspaceRoot) {
 vscode.window.showErrorMessage('AutoDev: Open a workspace folder first');
 return;
 }

 const cfg = vscode.workspace.getConfiguration('autodev');
 const healingEnabled = cfg.get('selfHealingEnabled', true);

 if (!healingEnabled) {
 const enable = await vscode.window.showInformationMessage(
 'Self-healing is disabled. Enable it to use this feature.',
 'Enable & Continue', 'Cancel');
 if (enable !== 'Enable & Continue') return;
 await cfg.update('selfHealingEnabled', true, vscode.ConfigurationTarget.Global);
 }

 const command = await vscode.window.showInputBox({
 prompt: 'Command to run (AutoDev will auto-fix any errors)',
 placeHolder: 'npm test | npm run build | python main.py | go build ./...',
 ignoreFocusOut: true,
 });
 if (!command?.trim()) return;

 const editor = vscode.window.activeTextEditor;
 const filePath = editor
 ? path.relative(workspaceRoot, editor.document.fileName)
 : 'index.ts';

 await vscode.window.withProgress(
 {
 location: vscode.ProgressLocation.Notification,
 title: 'AutoDev: Run and Heal',
 cancellable: false,
 },
 async progress => {
 const emit = (msg: string) => {
 progress.report({ message: msg });
 eventBus.emit({ type: 'progress', message: msg, timestamp: Date.now() });
 };

 emit(`Running: ${command}`);
 const llm = LLMProvider.fromVSCodeConfig();
 const healer = resetGlobalHealer(true, cfg.get('selfHealingMaxRetries', 3));

 const result = await healer.runAndHeal(command, filePath, workspaceRoot, llm, eventBus);

 if (result.healed) {
 vscode.window.showInformationMessage(
 `AutoDev: Self-healing fixed ${result.attempts.length} error(s) - command now passes`
 );
 } else if (result.attempts.length > 0) {
 vscode.window.showWarningMessage(
 `[Warning] AutoDev: Could not auto-fix after ${result.attempts.length} attempt(s). Manual fix needed.`
 );
 } else {
 vscode.window.showInformationMessage(`AutoDev: \`${command}\` passed with no errors`);
 }
 }
 );
}

//  Clear memory command 
export function clearMemoryCommand(): void {
 resetGlobalMemory();
 vscode.window.showInformationMessage('AutoDev: Conversation memory cleared');
}
