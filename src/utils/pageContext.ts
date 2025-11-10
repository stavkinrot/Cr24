/**
 * Page Context Utility
 * Captures webpage content to provide context-aware extension generation
 */

export interface PageContext {
  url: string;
  title: string;
  htmlSample: string;
  text: string;
  mainSelectors: {
    topClasses: string[];
    topIds: string[];
  };
  stats: {
    totalLinks: number;
    totalHeadings: number;
    hasLoginForm: boolean;
    hasSearchBox: boolean;
  };
  headings: string[];
  favicon?: string;
}

/**
 * Captures the current page content for context-aware extension generation
 */
export const capturePageContent = async (): Promise<PageContext | null> => {
  try {
    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      console.error('No active tab found');
      return null;
    }

    // Check if we can access the tab (some pages like chrome:// are restricted)
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      console.warn('Cannot capture content from restricted pages');
      return null;
    }

    // Inject script to extract page content
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          url: window.location.href,
          title: document.title,
          // Get first 5000 chars of HTML (enough for structure)
          html: document.documentElement.outerHTML,
          // Extract visible text
          text: document.body.innerText.substring(0, 3000),
          // Get headings
          headings: Array.from(document.querySelectorAll('h1, h2, h3'))
            .slice(0, 10)
            .map(h => h.textContent?.trim() || ''),
          // Get links count
          totalLinks: document.querySelectorAll('a').length,
          // Get headings count
          totalHeadings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length,
          // Check for login form
          hasLoginForm: !!document.querySelector('input[type="password"]'),
          // Check for search box
          hasSearchBox: !!document.querySelector('input[type="search"]') ||
                        !!document.querySelector('input[name*="search"]') ||
                        !!document.querySelector('input[placeholder*="search" i]'),
        };
      }
    });

    if (!result || !result[0]?.result) {
      console.error('Failed to extract page content');
      return null;
    }

    const rawData = result[0].result;

    // Summarize the page to stay under token limits
    const summarized = summarizePageContent(rawData);

    return {
      url: rawData.url,
      title: rawData.title,
      htmlSample: summarized.htmlSample,
      text: rawData.text,
      mainSelectors: summarized.mainSelectors,
      stats: {
        totalLinks: rawData.totalLinks,
        totalHeadings: rawData.totalHeadings,
        hasLoginForm: rawData.hasLoginForm,
        hasSearchBox: rawData.hasSearchBox,
      },
      headings: rawData.headings,
      favicon: tab.favIconUrl,
    };
  } catch (error) {
    console.error('Failed to capture page:', error);
    return null;
  }
};

/**
 * Summarizes page content to stay under token limits
 */
const summarizePageContent = (rawData: any): { htmlSample: string; mainSelectors: { topClasses: string[]; topIds: string[] } } => {
  const html = rawData.html;

  // Extract first 3000 chars of HTML (enough to see structure)
  const htmlSample = html.substring(0, 3000);

  // Extract main selectors
  const mainSelectors = extractMainSelectors(html);

  return {
    htmlSample,
    mainSelectors,
  };
};

/**
 * Extracts the most common class names and IDs from HTML
 */
const extractMainSelectors = (html: string): { topClasses: string[]; topIds: string[] } => {
  // Find all class attributes
  const classMatches = html.match(/class="([^"]+)"/g) || [];
  const classNames = classMatches
    .map(match => match.replace(/class="([^"]+)"/, '$1'))
    .flatMap(classes => classes.split(/\s+/))
    .filter(c => c.length > 0);

  // Find all id attributes
  const idMatches = html.match(/id="([^"]+)"/g) || [];
  const idNames = idMatches.map(match => match.replace(/id="([^"]+)"/, '$1'));

  // Count occurrences
  const classCount = countOccurrences(classNames);
  const idCount = countOccurrences(idNames);

  // Get top 20 most common
  const topClasses = Object.entries(classCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name]) => name);

  const topIds = Object.entries(idCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([name]) => name);

  return {
    topClasses,
    topIds,
  };
};

/**
 * Counts occurrences of items in an array
 */
const countOccurrences = (arr: string[]): Record<string, number> => {
  return arr.reduce((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

/**
 * Suggests prompts based on the detected page
 */
export const suggestPrompts = (pageContext: PageContext): string[] => {
  const url = pageContext.url.toLowerCase();

  // LinkedIn job search
  if (url.includes('linkedin.com/jobs')) {
    return [
      "Extract all job listings to CSV",
      "Highlight jobs matching specific keywords",
      "Track which jobs I've already viewed"
    ];
  }

  // Amazon product page
  if (url.includes('amazon.com/dp/') || url.includes('amazon.com/gp/product/')) {
    return [
      "Track price changes for this product",
      "Compare prices with other sellers",
      "Alert me when it's back in stock"
    ];
  }

  // Twitter/X
  if (url.includes('twitter.com') || url.includes('x.com')) {
    return [
      "Extract all tweets to JSON",
      "Auto-like tweets containing specific keywords",
      "Track engagement metrics"
    ];
  }

  // GitHub
  if (url.includes('github.com')) {
    return [
      "Export all repository links on this page",
      "Highlight repositories by programming language",
      "Track star counts"
    ];
  }

  // Reddit
  if (url.includes('reddit.com')) {
    return [
      "Extract all post titles and links",
      "Filter posts by upvote count",
      "Highlight posts from specific users"
    ];
  }

  // YouTube
  if (url.includes('youtube.com')) {
    return [
      "Extract video titles and descriptions",
      "Download video thumbnails",
      "Track view counts"
    ];
  }

  // Generic suggestions based on page features
  const suggestions: string[] = [];

  if (pageContext.stats.hasSearchBox) {
    suggestions.push("Auto-fill the search box with saved queries");
  }

  if (pageContext.stats.hasLoginForm) {
    suggestions.push("Auto-fill login credentials securely");
  }

  if (pageContext.stats.totalLinks > 20) {
    suggestions.push("Extract all links from this page to CSV");
  }

  if (pageContext.headings.length > 5) {
    suggestions.push("Create a table of contents from headings");
  }

  // Default suggestions
  if (suggestions.length === 0) {
    suggestions.push(
      "Extract important information from this page",
      "Highlight specific content",
      "Auto-fill form fields"
    );
  }

  return suggestions.slice(0, 3); // Return max 3 suggestions
};
