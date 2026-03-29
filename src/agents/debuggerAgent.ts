import { LLMProvider } from '../providers/llmProvider';
import { LLMMessage } from '../types';

const DEBUGGER_SYSTEM_PROMPT = `You are a senior software engineer doing a thorough code review.
Your job is to find and fix EVERY type of issue - not just syntax errors.

Look for ALL of the following:

BUGS AND ERRORS:
- Syntax errors, runtime errors, logic errors
- Wrong operators (= instead of ==, =+ instead of +=)
- Undefined variables, wrong variable names, wrong function names
- Division by zero, null/undefined access without checks
- Off-by-one errors, infinite loops, unreachable code

TYPOS AND NAMING:
- Typos in string literals (e.g. "sassys" instead of "says", "recieve" instead of "receive")
- Typos in variable names, function names, class names
- Inconsistent naming conventions
- Misspelled keywords or identifiers

MISSING ERROR HANDLING:
- API calls without try/catch
- File operations without error handling
- Network requests without timeout or error checks
- Missing null/undefined checks before property access
- Missing validation of function inputs

BAD PATTERNS:
- eval(), exec() with user input (security risk)
- Hardcoded credentials, API keys, passwords in code
- Blocking the event loop in async code
- Memory leaks (unclosed files, streams, connections)
- Deprecated APIs or methods
- SQL injection risks

CODE QUALITY:
- Unused variables, imports, or functions
- Dead code that never executes
- Functions doing too many things
- Missing return statements
- Incorrect data types

Return ONLY valid JSON in this exact format:
{
  "hasIssues": true,
  "issues": [
    {
      "line": 12,
      "type": "error | warning | typo | security | suggestion",
      "description": "exact description of what is wrong",
      "fix": "exact fix to apply"
    }
  ],
  "fixedCode": "the COMPLETE corrected file - every line, not just the changed parts",
  "summary": "brief summary listing each issue found and fixed"
}

CRITICAL RULES:
- Set hasIssues to true if you find ANY issue - even minor ones like typos in strings
- fixedCode must be the COMPLETE file from first line to last line
- Never truncate the fixedCode with comments like "// rest of code here"
- If a string literal contains a misspelling, fix it in fixedCode
- If error handling is missing, add it in fixedCode
- Always explain each issue clearly in plain English
- Do not invent issues that are not there - only report real problems`;


export class DebuggerAgent {
  constructor(private llm: LLMProvider) {}

  async analyzeAndFix(
    filePath: string,
    code: string,
    language: string,
    errorContext?: string,
    onStream?: (token: string) => void
  ): Promise<{
    hasIssues: boolean;
    fixedCode?: string;
    summary: string;
    issueCount: number;
    issues: Array<{ line?: number; type: string; description: string; fix?: string }>;
  }> {
    const messages: LLMMessage[] = [
      { role: 'system', content: DEBUGGER_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `File: ${filePath}
Language: ${language}
${errorContext ? `\nError/context:\n${errorContext}\n` : ''}
Code to analyse:
\`\`\`${language}
${code}
\`\`\`

Find and fix ALL bugs. Return JSON only.`,
      },
    ];

    const response = await this.llm.complete(messages, onStream);

    if (response.error) {
      throw new Error(`Debugger Agent failed: ${response.error}`);
    }

    try {
      const cleaned = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      const result = JSON.parse(cleaned);

      const issueCount = result.issues?.length ?? 0;

      // Detect issues even when the LLM incorrectly says hasIssues: false
      // If the fixedCode is different from the original, issues were clearly found
      const codeChanged = result.fixedCode &&
        result.fixedCode.trim() !== code.trim();

      const hasIssues = result.hasIssues === true ||
        issueCount > 0 ||
        codeChanged;

      return {
        hasIssues,
        fixedCode: result.fixedCode,
        summary: result.summary ?? 'No summary provided',
        issueCount: issueCount > 0 ? issueCount : (codeChanged ? 1 : 0),
        issues: result.issues ?? [],
      };
    } catch {
      return {
        hasIssues: false,
        summary: 'Could not parse debugger response',
        issueCount: 0,
        issues: [],
      };
    }
  }

  async fixFromTerminalError(
    code: string,
    language: string,
    terminalError: string,
    filePath: string
  ): Promise<{ fixedCode: string; explanation: string } | null> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a senior developer. Fix the code based on the terminal error.
Return ONLY JSON: { "fixedCode": "...", "explanation": "what was wrong and how it was fixed" }
fixedCode must be the COMPLETE corrected file.`,
      },
      {
        role: 'user',
        content: `File: ${filePath}

Terminal error:
\`\`\`
${terminalError}
\`\`\`

Code:
\`\`\`${language}
${code}
\`\`\``,
      },
    ];

    const response = await this.llm.complete(messages);
    if (response.error) return null;

    try {
      const cleaned = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }

  async generateTests(
    code: string,
    language: string,
    framework?: string,
    onStream?: (token: string) => void
  ): Promise<string> {
    const testFramework = framework ?? this.inferTestFramework(language);

    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are an expert in test-driven development.
Generate comprehensive tests using ${testFramework}.
Include: unit tests, edge cases, error cases.
Return ONLY the test file code - no JSON wrapping, no explanation outside the code.`,
      },
      {
        role: 'user',
        content: `Write tests for this ${language} code:\n\n\`\`\`${language}\n${code}\n\`\`\``,
      },
    ];

    const response = await this.llm.complete(messages, onStream);
    if (response.error) throw new Error(response.error);
    return response.content;
  }

  async refactorCode(
    code: string,
    language: string,
    goals: string[],
    onStream?: (token: string) => void
  ): Promise<{ refactoredCode: string; changes: string[] }> {
    const messages: LLMMessage[] = [
      {
        role: 'system',
        content: `You are a senior software engineer. Refactor the given code.
Return ONLY JSON: { "refactoredCode": "...", "changes": ["list of what was changed"] }
refactoredCode must be the COMPLETE refactored file.`,
      },
      {
        role: 'user',
        content: `Refactor this ${language} code. Goals: ${goals.join(', ')}.

\`\`\`${language}
${code}
\`\`\``,
      },
    ];

    const response = await this.llm.complete(messages, onStream);
    if (response.error) throw new Error(response.error);

    try {
      const cleaned = response.content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim();
      return JSON.parse(cleaned);
    } catch {
      return { refactoredCode: code, changes: ['Could not parse refactor response'] };
    }
  }

  private inferTestFramework(language: string): string {
    const map: Record<string, string> = {
      typescript: 'Jest',
      javascript: 'Jest',
      python: 'pytest',
      java: 'JUnit',
      go: 'testing (stdlib)',
      rust: 'Rust built-in tests',
      cpp: 'Google Test',
      csharp: 'xUnit',
    };
    return map[language.toLowerCase()] ?? 'appropriate test framework';
  }
}
