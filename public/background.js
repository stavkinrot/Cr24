/**
 * Background Service Worker for Cr24 Extension Generator
 * Handles long-running OpenAI API calls that persist when popup closes
 */

// Handle OpenAI API calls from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_EXTENSION') {
    handleGenerateExtension(message.payload)
      .then(response => sendResponse({ success: true, data: response }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

/**
 * Handle extension generation via OpenAI API
 * Runs in background, persists even when popup closes
 */
async function handleGenerateExtension(payload) {
  const { apiKey, model, temperature, messages, requestBody } = payload;

  console.log('[Background] Starting extension generation with model:', model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('[Background] OpenAI API error:', errorData);
      throw new Error(errorData.error?.message || 'API request failed');
    }

    const data = await response.json();
    console.log('[Background] Extension generation complete');

    return {
      content: data.choices[0].message.content,
      usage: data.usage,
    };
  } catch (error) {
    console.error('[Background] Error generating extension:', error);
    throw error;
  }
}

// Log when service worker starts
console.log('[Background] Cr24 Extension Generator service worker started');
