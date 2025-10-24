// Domain detection and pattern generation utilities

/**
 * Extract the registrable domain (eTLD+1) from a URL
 * Examples:
 *  - https://www.linkedin.com/feed -> linkedin.com
 *  - https://m.youtube.com/watch -> youtube.com
 *  - chrome://extensions -> null
 */
export function extractDomain(url: string): string | null {
  if (!url) return null;
  
  try {
    const urlObj = new URL(url);
    
    // Skip non-http(s) protocols
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      return null;
    }
    
    const hostname = urlObj.hostname;
    
    // Skip localhost and IPs
    if (hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      return null;
    }
    
    // Simple eTLD+1 extraction
    // For common TLDs, take last 2 parts. For known 2-part TLDs (co.uk, etc), take last 3
    const parts = hostname.split('.');
    
    if (parts.length < 2) return null;
    
    const tld = parts[parts.length - 1];
    const sld = parts[parts.length - 2];
    
    // Handle common 2-part TLDs
    const twoPartTLDs = ['co.uk', 'co.jp', 'com.au', 'co.in', 'co.za', 'com.br'];
    const lastTwoParts = `${sld}.${tld}`;
    
    if (twoPartTLDs.includes(lastTwoParts) && parts.length >= 3) {
      return `${parts[parts.length - 3]}.${sld}.${tld}`;
    }
    
    return lastTwoParts;
    
  } catch (err) {
    console.warn('[Domain Utils] Failed to parse URL:', url, err);
    return null;
  }
}

/**
 * Generate host match patterns for manifest
 * Returns patterns like *://*.domain.com/*
 */
export function generateMatchPatterns(domain: string | null): string[] {
  if (!domain) {
    return ['*://*/*'];
  }
  
  // Generate pattern that covers all subdomains and both http/https
  return [`*://*.${domain}/*`, `*://${domain}/*`];
}

/**
 * Get the current active tab's URL
 */
export async function getActiveTabUrl(): Promise<string | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.url || null;
  } catch (err) {
    console.warn('[Domain Utils] Failed to get active tab:', err);
    return null;
  }
}

/**
 * Detect domain from active tab and generate match patterns
 */
export async function detectDomainAndPatterns(): Promise<{
  domain: string | null;
  patterns: string[];
  displayName: string;
}> {
  const url = await getActiveTabUrl();
  const domain = url ? extractDomain(url) : null;
  const patterns = generateMatchPatterns(domain);
  
  return {
    domain,
    patterns,
    displayName: domain || 'All sites'
  };
}

