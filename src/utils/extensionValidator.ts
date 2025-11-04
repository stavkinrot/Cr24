/**
 * Extension Validator
 * Validates generated Chrome extensions for completeness and correctness
 */

import type { GeneratedExtension } from '../types';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Validates the manifest structure and required fields
 */
function validateManifest(manifest: any): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check manifest exists
  if (!manifest) {
    errors.push({
      field: 'manifest',
      message: 'Manifest is missing',
      severity: 'error',
    });
    return errors;
  }

  // Required fields
  const requiredFields = ['manifest_version', 'name', 'version', 'description'];
  for (const field of requiredFields) {
    if (!manifest[field]) {
      errors.push({
        field: `manifest.${field}`,
        message: `Required field "${field}" is missing`,
        severity: 'error',
      });
    }
  }

  // Validate manifest_version
  if (manifest.manifest_version && manifest.manifest_version !== 3) {
    errors.push({
      field: 'manifest.manifest_version',
      message: `Manifest version must be 3, got ${manifest.manifest_version}`,
      severity: 'error',
    });
  }

  // Validate version format (should be x.y.z)
  if (manifest.version && !/^\d+\.\d+(\.\d+)?$/.test(manifest.version)) {
    errors.push({
      field: 'manifest.version',
      message: `Version format invalid: "${manifest.version}". Expected format: x.y.z`,
      severity: 'warning',
    });
  }

  // Validate name length
  if (manifest.name && manifest.name.length > 45) {
    errors.push({
      field: 'manifest.name',
      message: `Extension name too long (${manifest.name.length} chars). Chrome limit is 45 characters.`,
      severity: 'warning',
    });
  }

  return errors;
}

/**
 * Validates that required files exist based on extension type
 */
function validateFiles(files: Record<string, string>, manifest: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!files || Object.keys(files).length === 0) {
    errors.push({
      field: 'files',
      message: 'No files generated',
      severity: 'error',
    });
    return errors;
  }

  // Check for popup extension files
  const hasPopupAction = manifest?.action || manifest?.browser_action;
  if (hasPopupAction) {
    const popupHtml = hasPopupAction.default_popup;
    if (popupHtml && !files[popupHtml]) {
      errors.push({
        field: 'files',
        message: `Popup HTML file "${popupHtml}" declared in manifest but not found in files`,
        severity: 'error',
      });
    }
  }

  // Check for content scripts
  const contentScripts = manifest?.content_scripts || [];
  for (const script of contentScripts) {
    if (script.js) {
      for (const jsFile of script.js) {
        if (!files[jsFile]) {
          errors.push({
            field: 'files',
            message: `Content script "${jsFile}" declared in manifest but not found in files`,
            severity: 'error',
          });
        }
      }
    }
    if (script.css) {
      for (const cssFile of script.css) {
        if (!files[cssFile]) {
          errors.push({
            field: 'files',
            message: `Content CSS "${cssFile}" declared in manifest but not found in files`,
            severity: 'error',
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Validates popup contract: HTML must reference local CSS and JS files
 */
function validatePopupContract(htmlContent: string, files: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!htmlContent) {
    return errors;
  }

  try {
    // Parse HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Check for parse errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      errors.push({
        field: 'popup.html',
        message: 'HTML parsing error: Invalid HTML syntax',
        severity: 'error',
      });
      return errors;
    }

    // Check <link> tags reference local CSS files
    const linkTags = doc.querySelectorAll('link[rel="stylesheet"]');
    linkTags.forEach((link) => {
      const href = link.getAttribute('href');
      if (href) {
        // Check if it's a CDN or external URL
        if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
          errors.push({
            field: 'popup.html',
            message: `External CSS not allowed: "${href}". Use local CSS files only.`,
            severity: 'error',
          });
        } else {
          // Check if local file exists
          if (!files[href]) {
            errors.push({
              field: 'popup.html',
              message: `Referenced CSS file "${href}" not found in files`,
              severity: 'error',
            });
          }
        }
      }
    });

    // Check <script> tags reference local JS files
    const scriptTags = doc.querySelectorAll('script[src]');
    scriptTags.forEach((script) => {
      const src = script.getAttribute('src');
      if (src) {
        // Check if it's a CDN or external URL
        if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
          errors.push({
            field: 'popup.html',
            message: `External JS not allowed: "${src}". Use local JS files only.`,
            severity: 'error',
          });
        } else {
          // Check if local file exists
          if (!files[src]) {
            errors.push({
              field: 'popup.html',
              message: `Referenced JS file "${src}" not found in files`,
              severity: 'error',
            });
          }
        }
      }
    });

    // Warn if no CSS file is linked
    if (linkTags.length === 0) {
      errors.push({
        field: 'popup.html',
        message: 'No CSS file linked. Consider adding styles for better UI.',
        severity: 'warning',
      });
    }

    // Warn if no JS file is linked
    if (scriptTags.length === 0) {
      errors.push({
        field: 'popup.html',
        message: 'No JS file linked. Extension may not have any functionality.',
        severity: 'warning',
      });
    }
  } catch (error) {
    errors.push({
      field: 'popup.html',
      message: `Failed to parse HTML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validates content script contract
 */
function validateContentScriptContract(manifest: any, files: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];

  const contentScripts = manifest?.content_scripts || [];
  const hasContentScriptInManifest = contentScripts.length > 0;
  const hasContentScriptFile = 'content.js' in files || Object.keys(files).some(f => f.includes('content'));

  // If content.js exists but not declared in manifest
  if (hasContentScriptFile && !hasContentScriptInManifest) {
    errors.push({
      field: 'manifest.content_scripts',
      message: 'Content script file exists but not declared in manifest.content_scripts',
      severity: 'error',
    });
  }

  // If content_scripts declared but files missing
  if (hasContentScriptInManifest && !hasContentScriptFile) {
    errors.push({
      field: 'files',
      message: 'Content scripts declared in manifest but no content script files found',
      severity: 'error',
    });
  }

  return errors;
}

/**
 * Validates icon declarations and formats
 */
function validateIcons(manifest: any, files: Record<string, string>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!manifest?.icons) {
    // Icons are optional, so just warn
    errors.push({
      field: 'manifest.icons',
      message: 'No icons declared. Extensions should have icons for better UX.',
      severity: 'warning',
    });
    return errors;
  }

  const icons = manifest.icons;
  const validSizes = ['16', '32', '48', '128'];

  // Check each declared icon
  for (const [size, iconPath] of Object.entries(icons)) {
    // Validate size
    if (!validSizes.includes(size)) {
      errors.push({
        field: 'manifest.icons',
        message: `Invalid icon size: ${size}. Valid sizes are: 16, 32, 48, 128`,
        severity: 'warning',
      });
    }

    // Validate icon file exists
    if (typeof iconPath === 'string') {
      if (!files[iconPath]) {
        errors.push({
          field: 'manifest.icons',
          message: `Icon file "${iconPath}" (${size}x${size}) not found in files`,
          severity: 'error',
        });
      } else {
        // Check if file is PNG format
        const fileContent = files[iconPath];
        const isPNG = iconPath.toLowerCase().endsWith('.png') ||
                      fileContent.startsWith('data:image/png;base64,') ||
                      fileContent.startsWith('iVBORw0KGgo'); // PNG header in base64

        if (!isPNG) {
          errors.push({
            field: 'manifest.icons',
            message: `Icon "${iconPath}" should be PNG format. Got: ${iconPath.split('.').pop()}`,
            severity: 'warning',
          });
        }
      }
    }
  }

  // Recommend having all standard sizes
  const missingSizes = validSizes.filter(size => !icons[size]);
  if (missingSizes.length > 0) {
    errors.push({
      field: 'manifest.icons',
      message: `Missing recommended icon sizes: ${missingSizes.join(', ')}`,
      severity: 'warning',
    });
  }

  return errors;
}

/**
 * Main validation function
 */
export function validateExtension(extensionData: GeneratedExtension): ValidationResult {
  const allErrors: ValidationError[] = [];

  // Validate manifest
  allErrors.push(...validateManifest(extensionData.manifest));

  // Validate files exist
  allErrors.push(...validateFiles(extensionData.files, extensionData.manifest));

  // Validate popup contract if popup extension
  const popupHtmlPath = extensionData.manifest?.action?.default_popup ||
                        extensionData.manifest?.browser_action?.default_popup ||
                        'popup.html';

  if (extensionData.files[popupHtmlPath]) {
    allErrors.push(...validatePopupContract(extensionData.files[popupHtmlPath], extensionData.files));
  }

  // Validate content script contract
  allErrors.push(...validateContentScriptContract(extensionData.manifest, extensionData.files));

  // Validate icons
  allErrors.push(...validateIcons(extensionData.manifest, extensionData.files));

  // Separate errors and warnings
  const errors = allErrors.filter(e => e.severity === 'error');
  const warnings = allErrors.filter(e => e.severity === 'warning');

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Formats validation errors for display to user
 */
export function formatValidationErrors(result: ValidationResult): string {
  if (result.isValid && result.warnings.length === 0) {
    return 'Extension validation passed!';
  }

  let message = '';

  if (result.errors.length > 0) {
    message += '❌ Validation Errors:\n';
    result.errors.forEach((err, idx) => {
      message += `${idx + 1}. [${err.field}] ${err.message}\n`;
    });
  }

  if (result.warnings.length > 0) {
    message += '\n⚠️ Warnings:\n';
    result.warnings.forEach((warn, idx) => {
      message += `${idx + 1}. [${warn.field}] ${warn.message}\n`;
    });
  }

  return message.trim();
}
