/**
 * Solver Validator - Validates LLM proposals against whitelists
 * Implements §4.3 (Solver Interface - Allowed IDs Whitelist)
 */

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate a proposal against a whitelist
 * @param proposal - The LLM's proposed output
 * @param whitelist - The allowed values for each field
 * @returns Validation result with any errors
 */
export function validateAgainstWhitelist(
    proposal: Record<string, unknown>,
    whitelist: Record<string, unknown>
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check each whitelist field
    for (const [field, allowedValues] of Object.entries(whitelist)) {
        // Skip metadata fields
        if (field === 'requiredFields' || field === 'objectCount' || field === 'explanation') {
            continue;
        }

        const proposedValue = proposal[field];

        // Skip if field not in proposal
        if (proposedValue === undefined) {
            continue;
        }

        // If whitelist provides an array of allowed values, validate against it
        if (Array.isArray(allowedValues)) {
            if (Array.isArray(proposedValue)) {
                // Proposed value is an array - check each element
                for (const item of proposedValue) {
                    if (!allowedValues.includes(item)) {
                        warnings.push(`${field}: "${item}" not in whitelist (allowed: ${allowedValues.slice(0, 5).join(', ')}...)`);
                    }
                }
            } else {
                // Proposed value is a single value
                if (!allowedValues.includes(proposedValue)) {
                    errors.push(`${field}: "${proposedValue}" not in whitelist (allowed: ${allowedValues.slice(0, 5).join(', ')}...)`);
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Validate required fields are present
 * @param proposal - The LLM's proposed output
 * @param requiredFields - List of required field names
 * @returns Validation result
 */
export function validateRequiredFields(
    proposal: Record<string, unknown>,
    requiredFields: string[]
): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const field of requiredFields) {
        if (proposal[field] === undefined || proposal[field] === null) {
            errors.push(`Missing required field: ${field}`);
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Combined validation for a solver response
 */
export function validateSolverProposal(
    proposal: Record<string, unknown>,
    whitelist: Record<string, unknown>
): ValidationResult {
    const results: ValidationResult[] = [];

    // Check required fields if specified
    if (whitelist.requiredFields && Array.isArray(whitelist.requiredFields)) {
        results.push(validateRequiredFields(proposal, whitelist.requiredFields as string[]));
    }

    // Check whitelist values
    results.push(validateAgainstWhitelist(proposal, whitelist));

    // Combine results
    return {
        valid: results.every(r => r.valid),
        errors: results.flatMap(r => r.errors),
        warnings: results.flatMap(r => r.warnings)
    };
}
