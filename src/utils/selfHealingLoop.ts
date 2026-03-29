import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { LLMProvider } from '../providers/llmProvider';
import { DebuggerAgent } from '../agents/debuggerAgent';
import { FileUtils } from '../utils/fileUtils';
import { AgentEventBus } from '../utils/eventBus';

export interface HealAttempt {
 attemptNumber: number;
 errorCaptured: string;
 filePath: string;
 fixApplied: boolean;
 fixSummary: string;
}

export interface HealResult {
 healed: boolean;
 attempts: HealAttempt[];
 finalError?: string;
}

// Patterns that indicate a real error worth healing
const ERROR_PATTERNS = [
 /Error:/i,
 /TypeError:/i,
 /ReferenceError:/i,
 /SyntaxError:/i,
 /Cannot find module/i,
 /is not defined/i,
 /is not a function/i,
 /Cannot read propert/i,
 /Traceback \(most recent/i,
 /Exception:/i,
 /FAILED/,
 /test.*failed/i,
 /compilation error/i,
 /build failed/i,
 /exit code [^0]/i,
 /npm ERR!/i,
 /error TS\d+/i,
 /panic:/i,
 /SIGSEGV/i,
];

// Patterns to IGNORE - not real errors
const IGNORE_PATTERNS = [
 /^\s*$/,
 /warning/i,
 /deprecated/i,
 /npm warn/i,
 /^\s*\d+ passed/i,
];

export class SelfHealingLoop {
 private maxRetries: number;
 private enabled: boolean;
 private terminalBuffer: Map<string, string> = new Map();
 private disposables: vscode.Disposable[] = [];

 constructor(enabled: boolean, maxRetries = 3) {
 this.enabled = enabled;
 this.maxRetries = maxRetries;
 }

 //  Start monitoring a terminal for errors 
 startMonitoring(
 _terminal: vscode.Terminal,
 _filePath: string,
 _llm: LLMProvider,
 eventBus: AgentEventBus,
 _workspaceRoot: string
 ): void {
 if (!this.enabled) return;

 eventBus.emit({
 type: 'log',
 message: `Self-healing: monitoring active`,
 timestamp: Date.now(),
 });
 }

 //  Run a command, capture output, auto-heal on error 
 async runAndHeal(
 command: string,
 filePath: string,
 workspaceRoot: string,
 llm: LLMProvider,
 eventBus: AgentEventBus
 ): Promise<HealResult> {
 if (!this.enabled) {
 return { healed: false, attempts: [] };
 }

 const attempts: HealAttempt[] = [];
 const debugger_ = new DebuggerAgent(llm);
 let currentError = '';

 const emit = (msg: string) =>
 eventBus.emit({ type: 'progress', message: msg, timestamp: Date.now() });

 for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
 emit(`Self-healing attempt ${attempt}/${this.maxRetries}: running \`${command}\``);

 // Run the command and capture output
 const { stdout, stderr, exitCode } = await this.runCommand(command, workspaceRoot);
 const output = `${stdout}\n${stderr}`.trim();

 // Check if there's an error worth healing
 const error = this.extractError(output);

 if (!error || exitCode === 0) {
 emit(`Self-healing: no errors detected${attempt > 1 ? ` after ${attempt} attempt(s)` : ''}`);
 return { healed: attempt > 1, attempts };
 }

 currentError = error;
 emit(`Error detected:\n${error.slice(0, 200)}`);
 emit(`Debugger Agent: analysing error and generating fix...`);

 // Read the current file content
 const absolutePath = path.join(workspaceRoot, filePath);
 if (!fs.existsSync(absolutePath)) {
 emit(`[Warning] File not found: ${filePath} - cannot self-heal`);
 break;
 }

 const code = fs.readFileSync(absolutePath, 'utf-8');
 const language = FileUtils.getLanguage(filePath);

 // Ask the Debugger Agent to fix it
 const fix = await debugger_.fixFromTerminalError(code, language, error, filePath);

 if (!fix) {
 emit(`[Warning] Debugger Agent could not generate a fix for attempt ${attempt}`);
 attempts.push({
 attemptNumber: attempt,
 errorCaptured: error,
 filePath,
 fixApplied: false,
 fixSummary: 'Could not parse fix from LLM response',
 });
 continue;
 }

 // Apply the fix
 fs.writeFileSync(absolutePath, fix.fixedCode, 'utf-8');
 emit(`Fix applied: ${fix.explanation}`);

 // Open the fixed file in VS Code
 const uri = vscode.Uri.file(absolutePath);
 await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });

 attempts.push({
 attemptNumber: attempt,
 errorCaptured: error,
 filePath,
 fixApplied: true,
 fixSummary: fix.explanation,
 });

 // Loop continues - run the command again to see if the fix worked
 }

 // After all retries
 if (currentError) {
 emit(`Self-healing exhausted ${this.maxRetries} attempt(s). Manual fix needed.`);
 eventBus.emit({
 type: 'error',
 message: `Self-healing failed after ${this.maxRetries} attempts: ${currentError.slice(0, 100)}`,
 timestamp: Date.now(),
 });
 }

 return {
 healed: false,
 attempts,
 finalError: currentError,
 };
 }

 //  Run a command and capture stdout + stderr 
 private runCommand(
 command: string,
 cwd: string
 ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
 return new Promise(resolve => {
 exec(command, { cwd, maxBuffer: 5 * 1024 * 1024, timeout: 60000 }, (err, stdout, stderr) => {
 resolve({
 stdout: stdout ?? '',
 stderr: stderr ?? '',
 exitCode: err?.code ?? 0,
 });
 });
 });
 }

 //  Extract the most useful error from terminal output 
 private extractError(output: string): string | null {
 if (!output.trim()) return null;

 const lines = output.split('\n');

 // Skip ignored lines
 const errorLines = lines.filter(line => {
 if (IGNORE_PATTERNS.some(p => p.test(line))) return false;
 return ERROR_PATTERNS.some(p => p.test(line));
 });

 if (errorLines.length === 0) return null;

 // Return up to 20 lines of context around the first error
 const firstErrorIndex = lines.findIndex(l => ERROR_PATTERNS.some(p => p.test(l)));
 if (firstErrorIndex === -1) return null;

 const start = Math.max(0, firstErrorIndex - 2);
 const end = Math.min(lines.length, firstErrorIndex + 18);
 return lines.slice(start, end).join('\n').trim();
 }

 isEnabled(): boolean {
 return this.enabled;
 }

 setEnabled(enabled: boolean): void {
 this.enabled = enabled;
 }

 dispose(): void {
 this.disposables.forEach(d => d.dispose());
 this.disposables = [];
 }
}

// Global singleton
let _globalHealer: SelfHealingLoop | null = null;

export function getGlobalHealer(enabled = true, maxRetries = 3): SelfHealingLoop {
 if (!_globalHealer) {
 _globalHealer = new SelfHealingLoop(enabled, maxRetries);
 }
 return _globalHealer;
}

export function resetGlobalHealer(enabled = true, maxRetries = 3): SelfHealingLoop {
 _globalHealer?.dispose();
 _globalHealer = new SelfHealingLoop(enabled, maxRetries);
 return _globalHealer;
}
