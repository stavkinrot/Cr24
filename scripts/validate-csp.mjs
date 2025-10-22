#!/usr/bin/env node
// CSP Validation Script for Extension Generator
// Ensures no inline JS, data URLs, or srcdoc usage that violates CSP

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const CSP_VIOLATIONS = [
  // Inline script tags
  /<script[^>]*>[^<]+<\/script>/gi,
  // Inline event handlers
  /\s+on\w+\s*=\s*["'][^"']*["']/gi,
  // JavaScript URLs
  /href\s*=\s*["']javascript:[^"']*["']/gi,
  // Data URLs in src attributes
  /src\s*=\s*["']data:text\/html[^"']*["']/gi,
  // srcdoc attributes
  /srcdoc\s*=\s*["'][^"']*["']/gi,
  // Inline styles with javascript:
  /style\s*=\s*["'][^"']*javascript:[^"']*["']/gi
];

const ALLOWED_PATTERNS = [
  // External script references are OK
  /<script[^>]*src\s*=\s*["'][^"']*["'][^>]*><\/script>/gi,
  // External CSS references are OK
  /<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi,
  // Blob URLs are OK for preview
  /src\s*=\s*["']blob:[^"']*["']/gi,
  // Chrome-shim inline script in preview-runner is OK (necessary for postMessage listener)
  /<script>\$\{chromeShimContent\}<\/script>/gi
];

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const violations = [];
  
  for (const pattern of CSP_VIOLATIONS) {
    const matches = content.match(pattern);
    if (matches) {
      for (const match of matches) {
        // Check if it's an allowed pattern
        const isAllowed = ALLOWED_PATTERNS.some(allowed => allowed.test(match));
        if (!isAllowed) {
          violations.push({
            file: filePath,
            pattern: pattern.toString(),
            match: match.substring(0, 100) + (match.length > 100 ? '...' : ''),
            line: getLineNumber(content, match)
          });
        }
      }
    }
  }
  
  return violations;
}

function getLineNumber(content, match) {
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(match.substring(0, 50))) {
      return i + 1;
    }
  }
  return 0;
}

function scanDirectory(dirPath, extensions = ['.html', '.ts', '.js', '.mjs']) {
  const violations = [];
  
  function scanRecursive(currentPath) {
    const items = readdirSync(currentPath);
    
    for (const item of items) {
      const fullPath = join(currentPath, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Skip node_modules and dist directories
        if (!['node_modules', 'dist', '.git'].includes(item)) {
          scanRecursive(fullPath);
        }
      } else if (extensions.includes(extname(item))) {
        const fileViolations = scanFile(fullPath);
        violations.push(...fileViolations);
      }
    }
  }
  
  scanRecursive(dirPath);
  return violations;
}

function validateManifestCSP() {
  try {
    const manifestPath = 'src/manifest.json';
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    
    if (!manifest.content_security_policy) {
      return [{
        file: manifestPath,
        issue: 'Missing content_security_policy in manifest.json',
        severity: 'error'
      }];
    }
    
    const csp = manifest.content_security_policy.extension_pages;
    const issues = [];
    
    if (!csp.includes("script-src 'self'")) {
      issues.push({
        file: manifestPath,
        issue: 'CSP should include script-src \'self\'',
        severity: 'warning'
      });
    }
    
    // Note: blob: cannot be in manifest CSP (Chrome rejects it as insecure)
    // We use chrome-extension:// URLs for preview scripts instead
    // blob: is only in the iframe meta tag CSP
    
    return issues;
  } catch (error) {
    return [{
      file: 'src/manifest.json',
      issue: `Failed to parse manifest: ${error.message}`,
      severity: 'error'
    }];
  }
}

function main() {
  console.log('🔍 Validating CSP compliance...\n');
  
  const violations = [];
  
  // Scan source files
  console.log('📁 Scanning source files...');
  const sourceViolations = scanDirectory('src');
  violations.push(...sourceViolations);
  
  // Validate manifest CSP
  console.log('📋 Validating manifest CSP...');
  const manifestIssues = validateManifestCSP();
  violations.push(...manifestIssues);
  
  // Report results
  if (violations.length === 0) {
    console.log('✅ All files are CSP compliant!');
    process.exit(0);
  } else {
    console.log(`❌ Found ${violations.length} CSP violations:\n`);
    
    for (const violation of violations) {
      console.log(`📄 ${violation.file}`);
      if (violation.line) {
        console.log(`   Line ${violation.line}: ${violation.match}`);
      }
      if (violation.issue) {
        console.log(`   Issue: ${violation.issue}`);
      }
      console.log(`   Pattern: ${violation.pattern || 'N/A'}`);
      console.log('');
    }
    
    console.log('💡 Fix these violations to ensure CSP compliance.');
    process.exit(1);
  }
}

// Run validation
main();
