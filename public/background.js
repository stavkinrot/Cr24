/**
 * Background Service Worker for Cr24 Extension Generator
 * Handles long-running OpenAI API calls that persist when popup closes
 */

// Track active generation requests
const activeGenerations = new Map();

// Handle OpenAI API calls from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GENERATE_EXTENSION') {
    const { chatId, ...payload } = message.payload;

    // Mark generation as in progress
    activeGenerations.set(chatId, { status: 'generating', startTime: Date.now() });

    handleGenerateExtension(payload, chatId)
      .then(response => {
        // Save to storage for popup to retrieve (even if closed)
        chrome.storage.local.get(['pendingResponses'], (result) => {
          const pendingResponses = result.pendingResponses || {};
          pendingResponses[chatId] = {
            success: true,
            data: response,
            timestamp: Date.now()
          };
          chrome.storage.local.set({ pendingResponses });
        });

        activeGenerations.delete(chatId);
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        // Save error to storage
        chrome.storage.local.get(['pendingResponses'], (result) => {
          const pendingResponses = result.pendingResponses || {};
          pendingResponses[chatId] = {
            success: false,
            error: error.message,
            timestamp: Date.now()
          };
          chrome.storage.local.set({ pendingResponses });
        });

        activeGenerations.delete(chatId);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep channel open for async response
  }

  if (message.type === 'CHECK_GENERATION_STATUS') {
    const { chatId } = message.payload;
    const status = activeGenerations.get(chatId);
    sendResponse({ status: status || null });
    return true;
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
