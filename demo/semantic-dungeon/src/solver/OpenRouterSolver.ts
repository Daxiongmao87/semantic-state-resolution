/**
 * OpenRouter Solver - LLM client using OpenRouter API
 * Implements §4.3 Solver Interface
 */

import type { SolverRequest, SolverResponse } from '../types';

export interface OpenRouterSolverConfig {
    baseUrl: string;
    apiKey: string;
    model: string;
    maxRetries: number;
}

const DEFAULT_CONFIG: OpenRouterSolverConfig = {
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: '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',
    model: 'mistralai/devstral-2512:free',
    maxRetries: 3
};

export class OpenRouterSolver {
    private config: OpenRouterSolverConfig;

    constructor(config: Partial<OpenRouterSolverConfig> = {}) {
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
                const response = await this.callOpenRouter(prompt);
                const parsed = this.parseResponse(request.requestId, response);

                if (parsed.success) {
                    return parsed;
                }

                console.warn(`[OpenRouterSolver] Attempt ${attempt} returned invalid response:`, parsed.error);
                lastError = new Error(parsed.error);
            } catch (error) {
                console.warn(`[OpenRouterSolver] Attempt ${attempt} failed:`, error);
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
     * Call OpenRouter API (OpenAI-compatible)
     */
    private async callOpenRouter(prompt: string): Promise<string> {
        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.apiKey}`,
                'HTTP-Referer': 'https://swfc-demo.local',
                'X-Title': 'SWFC Demo'
            },
            body: JSON.stringify({
                model: this.config.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a semantic constraint solver for a procedural generation system. You MUST respond with valid JSON only, no explanations or markdown.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();

        if (!data.choices?.[0]?.message?.content) {
            throw new Error('Invalid response format from OpenRouter');
        }

        return data.choices[0].message.content;
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
     * Test connectivity to OpenRouter
     */
    async testConnection(): Promise<{ connected: boolean; error?: string; latency?: number }> {
        const start = Date.now();

        try {
            const response = await fetch(`${this.config.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.config.apiKey}`
                },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                return { connected: false, error: `HTTP ${response.status}` };
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
let solverInstance: OpenRouterSolver | null = null;

export function getOpenRouterSolver(config?: Partial<OpenRouterSolverConfig>): OpenRouterSolver {
    if (!solverInstance || config) {
        solverInstance = new OpenRouterSolver(config);
    }
    return solverInstance;
}
