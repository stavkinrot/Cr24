// Recipe registry for domain-specific functionality
// Auto-bundles site-specific extractors when targeting known domains

export interface Recipe {
  domain: string;
  extractorPath: string;
  extractorContent: () => Promise<string>;
  description: string;
}

// Lazy-load LinkedIn extractor content
async function getLinkedInExtractorContent(): Promise<string> {
  try {
    const response = await fetch(chrome.runtime.getURL('src/generator/recipes/linkedin/extract-posts.js'));
    return await response.text();
  } catch (error) {
    console.error('Failed to load LinkedIn extractor:', error);
    // Fallback inline version
    return `export function extractPosts() { return { posts: [], count: 0, message: 'Extractor failed to load' }; }`;
  }
}

const recipes: Recipe[] = [
  {
    domain: 'linkedin.com',
    extractorPath: 'lib/extract-posts.js',
    extractorContent: getLinkedInExtractorContent,
    description: 'Extract posts from LinkedIn feed'
  }
];

/**
 * Get recipe for a given domain
 */
export function getRecipeForDomain(domain: string): Recipe | null {
  const normalizedDomain = domain.toLowerCase();
  
  for (const recipe of recipes) {
    if (normalizedDomain.includes(recipe.domain)) {
      return recipe;
    }
  }
  
  return null;
}

/**
 * Check if a domain has a recipe
 */
export function hasRecipe(domain: string): boolean {
  return getRecipeForDomain(domain) !== null;
}

/**
 * Get all available recipes
 */
export function getAllRecipes(): Recipe[] {
  return [...recipes];
}

