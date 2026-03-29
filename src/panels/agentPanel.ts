import * as vscode from 'vscode';
import { AgentEventBus } from '../utils/eventBus';
import { LLMProvider } from '../providers/llmProvider';

export class AgentSidebarProvider implements vscode.WebviewViewProvider {
 public static readonly viewType = 'autodev.sidebarView';
 private _view?: vscode.WebviewView;

 constructor(
 private readonly extensionUri: vscode.Uri,
 private readonly eventBus: AgentEventBus
 ) {
 // Push agent events into the webview
 eventBus.on(event => {
 this._view?.webview.postMessage({ type: 'agentEvent', event });
 });
 }

 resolveWebviewView(
 webviewView: vscode.WebviewView,
 _context: vscode.WebviewViewResolveContext,
 _token: vscode.CancellationToken
 ): void {
 this._view = webviewView;

 webviewView.webview.options = {
 enableScripts: true,
 localResourceRoots: [this.extensionUri],
 };

 webviewView.webview.html = this.getHtml();

 // Send initial toggle states so checkboxes reflect current settings
 const cfg = vscode.workspace.getConfiguration('autodev');
 setTimeout(() => {
 webviewView.webview.postMessage({
 type: 'initToggles',
 selfHealingEnabled: cfg.get('selfHealingEnabled', true),
 conversationMemoryEnabled: cfg.get('conversationMemoryEnabled', true),
 });
 }, 500);

 webviewView.webview.onDidReceiveMessage(async msg => {
 switch (msg.command) {
 case 'generateFromIntent':
 await vscode.commands.executeCommand('autodev.generateFromIntent', msg.intent);
 break;
 case 'fixProject':
 await vscode.commands.executeCommand('autodev.fixProject');
 break;
 case 'fixSelection':
 await vscode.commands.executeCommand('autodev.fixSelection');
 break;
 case 'refactorFile':
 await vscode.commands.executeCommand('autodev.refactorFile');
 break;
 case 'generateTests':
 await vscode.commands.executeCommand('autodev.writTests');
 break;
 case 'testConnection':
 await this.testConnection(webviewView.webview);
 break;
 case 'runAndHeal':
 await vscode.commands.executeCommand('autodev.runAndHeal');
 break;
 case 'clearMemory':
 await vscode.commands.executeCommand('autodev.clearMemory');
 break;
 case 'toggleFeature':
 await vscode.workspace.getConfiguration('autodev')
 .update(msg.feature, msg.enabled, vscode.ConfigurationTarget.Global);
 break;
 case 'configureProvider':
 await vscode.commands.executeCommand('autodev.configureProvider');
 break;
 case 'openSettings':
 await vscode.commands.executeCommand('workbench.action.openSettings', 'autodev');
 break;
 }
 });
 }

 private async testConnection(webview: vscode.Webview): Promise<void> {
 webview.postMessage({ type: 'connectionTesting' });
 const llm = LLMProvider.fromVSCodeConfig();
 const result = await llm.testConnection();
 webview.postMessage({ type: 'connectionResult', ...result });
 }

 private getHtml(): string {
 return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
 * { box-sizing: border-box; margin: 0; padding: 0; }
 body {
 font-family: var(--vscode-font-family);
 font-size: 13px;
 color: var(--vscode-foreground);
 background: var(--vscode-sideBar-background);
 padding: 0;
 overflow-x: hidden;
 }

 .header {
 padding: 14px 14px 10px;
 border-bottom: 1px solid var(--vscode-panel-border);
 }
 .header h1 {
 font-size: 13px;
 font-weight: 600;
 display: flex;
 align-items: center;
 gap: 6px;
 margin-bottom: 4px;
 }
 .header p {
 font-size: 11px;
 color: var(--vscode-descriptionForeground);
 }

 .section { padding: 10px 14px; border-bottom: 1px solid var(--vscode-panel-border); }
 .section-title {
 font-size: 11px;
 font-weight: 600;
 text-transform: uppercase;
 letter-spacing: 0.06em;
 color: var(--vscode-descriptionForeground);
 margin-bottom: 8px;
 }

 /* Intent input */
 .intent-wrap { display: flex; gap: 6px; }
 .intent-input {
 flex: 1;
 background: var(--vscode-input-background);
 color: var(--vscode-input-foreground);
 border: 1px solid var(--vscode-input-border, transparent);
 border-radius: 4px;
 padding: 6px 8px;
 font-size: 12px;
 font-family: inherit;
 outline: none;
 }
 .intent-input:focus { border-color: var(--vscode-focusBorder); }
 .intent-input::placeholder { color: var(--vscode-input-placeholderForeground); }

 /* Buttons */
 .btn {
 display: flex;
 align-items: center;
 gap: 6px;
 width: 100%;
 padding: 7px 10px;
 background: var(--vscode-button-secondaryBackground, transparent);
 color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
 border: 1px solid var(--vscode-panel-border);
 border-radius: 4px;
 cursor: pointer;
 font-size: 12px;
 font-family: inherit;
 text-align: left;
 margin-bottom: 5px;
 transition: background 0.1s;
 }
 .btn:hover { background: var(--vscode-list-hoverBackground); }
 .btn:active { opacity: 0.8; }
 .btn-primary {
 background: var(--vscode-button-background);
 color: var(--vscode-button-foreground);
 border-color: transparent;
 }
 .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
 .btn-danger {
 background: transparent;
 border-color: var(--vscode-inputValidation-errorBorder, #f44);
 color: var(--vscode-errorForeground, #f88);
 }

 .btn-icon { font-size: 14px; }

 /* Activity log */
 .log-wrap {
 max-height: 200px;
 overflow-y: auto;
 background: var(--vscode-editor-background);
 border: 1px solid var(--vscode-panel-border);
 border-radius: 4px;
 padding: 6px 8px;
 font-family: var(--vscode-editor-font-family);
 font-size: 11px;
 line-height: 1.6;
 }
 .log-line { word-break: break-all; }
 .log-line.error { color: var(--vscode-errorForeground); }
 .log-line.complete { color: #4ec994; }
 .log-line.thinking { color: var(--vscode-descriptionForeground); }

 /* Status indicator */
 .status-row {
 display: flex;
 align-items: center;
 gap: 6px;
 font-size: 11px;
 padding: 4px 0;
 color: var(--vscode-descriptionForeground);
 }
 .status-dot {
 width: 7px; height: 7px;
 border-radius: 50%;
 background: var(--vscode-descriptionForeground);
 flex-shrink: 0;
 }
 .status-dot.ok { background: #4ec994; }
 .status-dot.error { background: #f48771; }
 .status-dot.testing { background: #e2c355; animation: pulse 1s infinite; }
 @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

 /* Provider badge */
 .provider-badge {
 display: inline-block;
 background: var(--vscode-badge-background);
 color: var(--vscode-badge-foreground);
 padding: 1px 7px;
 border-radius: 10px;
 font-size: 10px;
 font-weight: 600;
 }

 /* Quick prompts */
 .provider-btn { font-size: 11px; padding: 5px 6px; text-align: center; justify-content: center; }
 .provider-btn.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }

 display: inline-block;
 background: var(--vscode-editor-background);
 border: 1px solid var(--vscode-panel-border);
 border-radius: 4px;
 padding: 3px 8px;
 font-size: 11px;
 cursor: pointer;
 margin: 2px 2px 2px 0;
 transition: background 0.1s;
 }
 .quick-prompt:hover { background: var(--vscode-list-hoverBackground); }
</style>
</head>
<body>

<div class="header">
 <h1>AutoDev Agent</h1>
 <p>Autonomous AI coding agent</p>
</div>

<!-- INTENT -> GENERATE -->
<div class="section">
 <div class="section-title">Generate from Intent</div>
 <div class="intent-wrap" style="margin-bottom:8px">
 <input
 type="text"
 class="intent-input"
 id="intentInput"
 placeholder="Build REST API with auth..."
 onkeydown="if(event.key==='Enter')generate()"
 />
 <button class="btn btn-primary" onclick="generate()" style="width:auto;padding:6px 10px;margin:0">
 Go
 </button>
 </div>
 <div id="quickPrompts">
 <span class="quick-prompt" onclick="setIntent('REST API with JWT auth')">JWT API</span>
 <span class="quick-prompt" onclick="setIntent('React login form with validation')">Login form</span>
 <span class="quick-prompt" onclick="setIntent('Express server with CRUD routes')">CRUD server</span>
 <span class="quick-prompt" onclick="setIntent('Python FastAPI with SQLAlchemy')">FastAPI</span>
 <span class="quick-prompt" onclick="setIntent('CLI tool with argparse and config file')">CLI tool</span>
 </div>
</div>

<!-- QUICK ACTIONS -->
<div class="section">
 <div class="section-title">Quick Actions</div>
 <button class="btn btn-danger" onclick="fixProject()">
 <span class="btn-icon"></span>
 Fix Entire Project
 </button>
 <button class="btn" onclick="runAndHeal()">
 <span class="btn-icon"></span>
 Run &amp; Self-Heal
 </button>
 <button class="btn" onclick="fixSelection()">
 <span class="btn-icon"></span>
 Fix &amp; Explain Selection
 </button>
 <button class="btn" onclick="refactorFile()">
 <span class="btn-icon"></span>
 Refactor Current File
 </button>
 <button class="btn" onclick="generateTests()">
 <span class="btn-icon"></span>
 Generate Tests
 </button>
</div>

<!-- AI FEATURES TOGGLES -->
<div class="section">
 <div class="section-title">AI Features</div>
 <div style="display:flex;flex-direction:column;gap:6px">
 <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
 <span style="color:var(--vscode-foreground)">Self-healing loop</span>
 <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
 <input type="checkbox" id="toggleHealing" onchange="toggleFeature('selfHealingEnabled', this.checked)" style="cursor:pointer"/>
 <span id="healLabel" style="font-size:11px;color:var(--vscode-descriptionForeground)">ON</span>
 </label>
 </div>
 <div style="font-size:11px;color:var(--vscode-descriptionForeground);padding:0 0 4px 0">
 Auto-fixes errors when generated code is run
 </div>
 <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px">
 <span style="color:var(--vscode-foreground)">Conversation memory</span>
 <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
 <input type="checkbox" id="toggleMemory" onchange="toggleFeature('conversationMemoryEnabled', this.checked)" style="cursor:pointer"/>
 <span id="memLabel" style="font-size:11px;color:var(--vscode-descriptionForeground)">ON</span>
 </label>
 </div>
 <div style="font-size:11px;color:var(--vscode-descriptionForeground);padding:0 0 4px 0">
 Agents remember previous turns and files
 </div>
 <button class="btn" onclick="clearMemory()" style="margin-top:2px;font-size:11px;padding:5px 8px">
 Clear Memory Session
 </button>
 </div>
</div>

<!-- ACTIVITY LOG -->
<div class="section">
 <div class="section-title" style="display:flex;justify-content:space-between">
 <span>Activity Log</span>
 <span onclick="clearLog()" style="cursor:pointer;font-size:10px;text-transform:none;letter-spacing:0">Clear</span>
 </div>
 <div class="log-wrap" id="logWrap">
 <div class="log-line thinking">Ready. Select an action above to start.</div>
 </div>
</div>

<!-- PROVIDER STATUS -->
<div class="section">
 <div class="section-title">LLM Provider</div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:8px">
 <button class="btn provider-btn" onclick="pickProvider('ollama')" id="btn-ollama">
 Ollama (local)
 </button>
 <button class="btn provider-btn" onclick="pickProvider('gemini')" id="btn-gemini">
 Gemini (free)
 </button>
 <button class="btn provider-btn" onclick="pickProvider('anthropic')" id="btn-anthropic">
 Claude
 </button>
 <button class="btn provider-btn" onclick="pickProvider('groq')" id="btn-groq">
 Groq (free)
 </button>
 <button class="btn provider-btn" onclick="pickProvider('openai')" id="btn-openai">
 OpenAI
 </button>
 <button class="btn provider-btn" onclick="pickProvider('openai-compatible')" id="btn-openai-compatible">
 Custom API
 </button>
 </div>
 <div class="status-row">
 <div class="status-dot" id="statusDot"></div>
 <span id="statusText">Not tested</span>
 </div>
 <div style="display:flex;gap:6px;margin-top:8px">
 <button class="btn" style="flex:1;margin:0" onclick="testConnection()">Test Connection</button>
 <button class="btn" style="flex:1;margin:0" onclick="openSettings()">Settings</button>
 </div>
</div>

<script>
 const vscode = acquireVsCodeApi();

 function log(msg, type = '') {
 const wrap = document.getElementById('logWrap');
 const div = document.createElement('div');
 div.className = 'log-line ' + type;
 div.textContent = msg;
 wrap.appendChild(div);
 wrap.scrollTop = wrap.scrollHeight;
 // Keep max 100 entries
 while (wrap.children.length > 100) wrap.removeChild(wrap.firstChild);
 }

 function clearLog() {
 document.getElementById('logWrap').innerHTML = '';
 }

 function pickProvider(p) {
 vscode.postMessage({ command: 'configureProvider', provider: p });
 document.querySelectorAll('.provider-btn').forEach(b => b.classList.remove('active'));
 const btn = document.getElementById('btn-' + p);
 if (btn) btn.classList.add('active');
 log('Switching to ' + p + '...');
 }

 function setIntent(text) {
 document.getElementById('intentInput').value = text;
 document.getElementById('intentInput').focus();
 }

 function generate() {
 const intent = document.getElementById('intentInput').value.trim();
 if (!intent) return;
 log('Generating: ' + intent);
 vscode.postMessage({ command: 'generateFromIntent', intent });
 }

 function runAndHeal() {
 log('Run & Self-Heal started...');
 vscode.postMessage({ command: 'runAndHeal' });
 }

 function clearMemory() {
 log('Memory cleared');
 vscode.postMessage({ command: 'clearMemory' });
 }

 function toggleFeature(feature, enabled) {
 log((enabled ? '' : '') + feature + ' ' + (enabled ? 'enabled' : 'disabled'));
 vscode.postMessage({ command: 'toggleFeature', feature, enabled });
 if (feature === 'selfHealingEnabled') document.getElementById('healLabel').textContent = enabled ? 'ON' : 'OFF';
 if (feature === 'conversationMemoryEnabled') document.getElementById('memLabel').textContent = enabled ? 'ON' : 'OFF';
 }

 function fixProject() {
 log('Starting project scan...');
 vscode.postMessage({ command: 'fixProject' });
 }

 function fixSelection() {
 log('Fixing selection...');
 vscode.postMessage({ command: 'fixSelection' });
 }

 function refactorFile() {
 log('Opening refactor options...');
 vscode.postMessage({ command: 'refactorFile' });
 }

 function generateTests() {
 log('Generating tests...');
 vscode.postMessage({ command: 'generateTests' });
 }

 function testConnection() {
 document.getElementById('statusDot').className = 'status-dot testing';
 document.getElementById('statusText').textContent = 'Testing...';
 vscode.postMessage({ command: 'testConnection' });
 }

 function openSettings() {
 vscode.postMessage({ command: 'openSettings' });
 }

 // Initialise toggles from VS Code config on load
 window.addEventListener('message', e => {
 const msg = e.data;
 if (msg.type === 'initToggles') {
 const healChk = document.getElementById('toggleHealing');
 const memChk = document.getElementById('toggleMemory');
 if (healChk) { healChk.checked = msg.selfHealingEnabled; document.getElementById('healLabel').textContent = msg.selfHealingEnabled ? 'ON' : 'OFF'; }
 if (memChk) { memChk.checked = msg.conversationMemoryEnabled; document.getElementById('memLabel').textContent = msg.conversationMemoryEnabled ? 'ON' : 'OFF'; }
 }
 if (msg.type === 'agentEvent') {
 const ev = msg.event;
 const typeMap = { error: 'error', complete: 'complete', thinking: 'thinking' };
 log(ev.message, typeMap[ev.type] || '');
 }
 if (msg.type === 'connectionResult') {
 const dot = document.getElementById('statusDot');
 const txt = document.getElementById('statusText');
 dot.className = 'status-dot ' + (msg.ok ? 'ok' : 'error');
 txt.textContent = msg.message;
 }
 if (msg.type === 'connectionTesting') {
 document.getElementById('statusDot').className = 'status-dot testing';
 document.getElementById('statusText').textContent = 'Connecting...';
 }
 });
</script>
</body>
</html>`;
 }
}

// Full Panel (opened via command palette) 
export class AgentPanel {
 public static currentPanel?: AgentPanel;
 private readonly panel: vscode.WebviewPanel;

 public static createOrShow(extensionUri: vscode.Uri, eventBus: AgentEventBus): void {
 if (AgentPanel.currentPanel) {
 AgentPanel.currentPanel.panel.reveal();
 return;
 }
 const panel = vscode.window.createWebviewPanel(
 'autodevPanel',
 'AutoDev Agent',
 vscode.ViewColumn.One,
 { enableScripts: true }
 );
 AgentPanel.currentPanel = new AgentPanel(panel, eventBus);
 }

 private constructor(panel: vscode.WebviewPanel, eventBus: AgentEventBus) {
 this.panel = panel;
 this.panel.onDidDispose(() => { AgentPanel.currentPanel = undefined; });
 eventBus.on(event => {
 this.panel.webview.postMessage({ type: 'agentEvent', event });
 });
 }
}
