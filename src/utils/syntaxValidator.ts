import * as acorn from 'acorn';

export interface SyntaxError {
  file: string;
  line: number;
  column: number;
  message: string;
}

export interface SyntaxValidationResult {
  valid: boolean;
  errors: SyntaxError[];
}

/**
 * Validates JavaScript code for syntax errors using Acorn parser
 * @param code - JavaScript code to validate
 * @param filename - Name of the file being validated (for error reporting)
 * @returns Validation result with any syntax errors found
 */
export function validateJavaScript(code: string, filename: string): SyntaxValidationResult {
  try {
    // Parse the code with Acorn - if it parses successfully, syntax is valid
    acorn.parse(code, {
      ecmaVersion: 2020,
      sourceType: 'script', // Most Chrome extension scripts are non-module
    });

    return { valid: true, errors: [] };
  } catch (e: any) {
    // Acorn throws SyntaxError with detailed location info
    return {
      valid: false,
      errors: [{
        file: filename,
        line: e.loc?.line || 0,
        column: e.loc?.column || 0,
        message: e.message,
      }],
    };
  }
}

/**
 * Validates all JavaScript files in a generated extension
 * @param files - Object containing file contents (e.g., { 'popup.js': '...', 'content.js': '...' })
 * @returns Combined validation result for all JS files
 */
export function validateExtensionJavaScript(files: Record<string, string>): SyntaxValidationResult {
  const jsFiles = ['popup.js', 'content.js', 'background.js', 'service-worker.js'];
  const allErrors: SyntaxError[] = [];

  for (const filename of jsFiles) {
    if (files[filename]) {
      const result = validateJavaScript(files[filename], filename);
      if (!result.valid) {
        allErrors.push(...result.errors);
      }
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Formats syntax errors into a human-readable message for AI to fix
 * @param errors - Array of syntax errors
 * @returns Formatted error message
 */
export function formatSyntaxErrors(errors: SyntaxError[]): string {
  if (errors.length === 0) return '';

  let message = 'JavaScript Syntax Errors Found:\n\n';

  errors.forEach((error, index) => {
    message += `${index + 1}. **${error.file}** (line ${error.line}, column ${error.column})\n`;
    message += `   Error: ${error.message}\n\n`;
  });

  return message;
}
