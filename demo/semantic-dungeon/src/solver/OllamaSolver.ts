/**
 * Ollama Solver - LLM client for qwen2.5:7b
 * Implements §4.3 Solver Interface
 */

import type { SolverRequest, SolverResponse } from '../types';

export interface OllamaSolverConfig {
    baseUrl: string;
    model: string;
    timeout: number;
    maxRetries: number;
}

const DEFAULT_CONFIG: OllamaSolverConfig = {
    baseUrl: 'http://192.168.87.121:11434',
    model: 'qwen2.5:7b',
    timeout: 0, // 0 = no timeout, LLM calls complete when they complete
    maxRetries: 3
};

export class OllamaSolver {
    private config: OllamaSolverConfig;

    constructor(config: Partial<OllamaSolverConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Send a solver request to the LLM and get a structured response
     */
    async solve(request: SolverRequest): Promise<SolverResponse> {
        const prompt = this.buildPrompt(request);

        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                const response = await this.callOllama(prompt);
                const parsed = this.parseResponse(request.requestId, response);

                if (parsed.success) {
                    return parsed;
                }

                console.warn(`[OllamaSolver] Attempt ${attempt} returned invalid response:`, parsed.error);
                lastError = new Error(parsed.error);
            } catch (error) {
                console.warn(`[OllamaSolver] Attempt ${attempt} failed:`, error);
                lastError = error instanceof Error ? error : new Error(String(error));
            }
        }

        return {
            requestId: request.requestId,
            success: false,
            error: `All ${this.config.maxRetries} attempts failed. Last error: ${lastError?.message}`
        };
    }

    /**
     * Build the prompt from a solver request
     */
    private buildPrompt(request: SolverRequest): string {
        const lines: string[] = [
            `TASK: ${request.taskType}`,
            '',
            'CONTEXT:',
            JSON.stringify(request.context, null, 2),
            '',
            'CONSTRAINTS:',
            `Hard: ${JSON.stringify(request.constraints.hard.map(c => ({ key: c.key, value: c.value })))}`,
            `Soft: ${JSON.stringify(request.constraints.soft.map(c => ({ key: c.key, value: c.value })))}`,
            '',
            'WHITELIST (you MUST only use values from these lists):',
            JSON.stringify(request.whitelist, null, 2),
            '',
            'Respond with ONLY a valid JSON object matching the task requirements.',
            'Do not include any explanation or markdown formatting.',
            'Do not include ```json or ``` markers.'
        ];

        return lines.join('\n');
    }

    /**
     * Call Ollama API
     */
    private async callOllama(prompt: string): Promise<string> {
        const controller = new AbortController();
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        // Only set timeout if configured (0 = no timeout)
        if (this.config.timeout > 0) {
            timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        }

        try {
            const response = await fetch(`${this.config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.config.model,
                    prompt: prompt,
                    stream: false,
                    format: 'json'
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.response;
        } finally {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
        }
    }

    /**
     * Parse the LLM response into a SolverResponse
     */
    private parseResponse(requestId: string, rawResponse: string): SolverResponse {
        try {
            // Try to extract JSON from the response
            let jsonStr = rawResponse.trim();

            // Handle markdown code blocks if present
            const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            const proposal = JSON.parse(jsonStr);

            return {
                requestId,
                success: true,
                proposal
            };
        } catch (error) {
            return {
                requestId,
                success: false,
                error: `Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Test connectivity to the Ollama server
     */
    async testConnection(): Promise<{ connected: boolean; error?: string; latency?: number }> {
        const start = Date.now();

        try {
            const response = await fetch(`${this.config.baseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) {
                return { connected: false, error: `HTTP ${response.status}` };
            }

            const data = await response.json();
            const hasModel = data.models?.some((m: { name: string }) =>
                m.name.includes(this.config.model.split(':')[0])
            );

            if (!hasModel) {
                return {
                    connected: true,
                    error: `Model ${this.config.model} not found`,
                    latency: Date.now() - start
                };
            }

            return { connected: true, latency: Date.now() - start };
        } catch (error) {
            return {
                connected: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

// Singleton instance
let solverInstance: OllamaSolver | null = null;

export function getOllamaSolver(config?: Partial<OllamaSolverConfig>): OllamaSolver {
    if (!solverInstance || config) {
        solverInstance = new OllamaSolver(config);
    }
    return solverInstance;
}
