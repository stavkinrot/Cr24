// dom-handlers.ts - CSP-compliant event handler binding for extension preview
// This script binds event handlers to generated extension UI elements

/**
 * Test functions for extension preview
 */
function testStorage() {
  console.log('[Preview] Testing storage...');
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.set({test: 'Hello World', timestamp: Date.now()}, () => {
      chrome.storage.local.get(['test', 'timestamp'], (result) => {
        console.log('[Preview] Storage test result:', result);
        const resultDiv = document.getElementById('result');
        if (resultDiv) {
          resultDiv.innerHTML = 'Storage test: ' + JSON.stringify(result, null, 2);
        }
      });
    });
  } else {
    console.warn('[Preview] Chrome storage API not available');
    const resultDiv = document.getElementById('result');
    if (resultDiv) {
      resultDiv.innerHTML = 'Chrome storage API not available';
    }
  }
}

function testMessaging() {
  console.log('[Preview] Testing chrome.runtime.sendMessage...');
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.sendMessage({action: 'test', data: 'Hello from popup'}, (response) => {
      console.log('[Preview] Message response:', response);
      const resultDiv = document.getElementById('result');
      if (resultDiv) {
        resultDiv.innerHTML = 'Message response: ' + JSON.stringify(response, null, 2);
      }
    });
  } else {
    console.warn('[Preview] Chrome runtime API not available');
    const resultDiv = document.getElementById('result');
    if (resultDiv) {
      resultDiv.innerHTML = 'Chrome runtime API not available';
    }
  }
}

function calculateLove() {
  const names = ['Alice & Bob', 'John & Jane', 'Romeo & Juliet'];
  const name = names[Math.floor(Math.random() * names.length)];
  const percentage = Math.floor(Math.random() * 100) + 1;
  const resultDiv = document.getElementById('result');
  if (resultDiv) {
    resultDiv.innerHTML = '💖 ' + name + ': ' + percentage + '% Love Match!';
  }
}

/**
 * Binds known handlers to specific button IDs
 */
function bindKnownHandlers() {
  const testStorageBtn = document.getElementById('testStorageBtn');
  const testMessagingBtn = document.getElementById('testMessagingBtn');
  const calculateLoveBtn = document.getElementById('calculateLoveBtn');
  
  if (testStorageBtn && !testStorageBtn.dataset.bound) {
    testStorageBtn.addEventListener('click', testStorage);
    testStorageBtn.dataset.bound = 'true';
    console.log('[Preview] Bound testStorage handler');
  }
  
  if (testMessagingBtn && !testMessagingBtn.dataset.bound) {
    testMessagingBtn.addEventListener('click', testMessaging);
    testMessagingBtn.dataset.bound = 'true';
    console.log('[Preview] Bound testMessaging handler');
  }
  
  if (calculateLoveBtn && !calculateLoveBtn.dataset.bound) {
    calculateLoveBtn.addEventListener('click', calculateLove);
    calculateLoveBtn.dataset.bound = 'true';
    console.log('[Preview] Bound calculateLove handler');
  }
}

/**
 * Binds handlers based on button text or patterns
 */
function bindGenericHandlers() {
  const allButtons = document.querySelectorAll('button:not([data-bound]), input[type="button"]:not([data-bound]), input[type="submit"]:not([data-bound])');
  
  allButtons.forEach(button => {
    const text = (button.textContent || (button as HTMLInputElement).value || '').toLowerCase();
    const id = button.id.toLowerCase();
    
    let handler: (() => void) | null = null;
    
    if (text.includes('storage') || id.includes('storage')) {
      handler = testStorage;
    } else if (text.includes('message') || text.includes('messaging') || id.includes('message')) {
      handler = testMessaging;
    } else if (text.includes('love') || id.includes('love')) {
      handler = calculateLove;
    } else if (text.includes('test') && !id.includes('increment') && !id.includes('decrement')) {
      // Generic test button - try storage
      handler = testStorage;
    }
    
    if (handler) {
      button.addEventListener('click', handler);
      button.setAttribute('data-bound', 'true');
      console.log('[Preview] Bound handler to button:', text || id);
    }
  });
}

/**
 * Main initialization function - binds all preview handlers
 */
export function bindPreviewHandlers() {
  console.log('[Preview] DOM Handlers module loaded, document ready state:', document.readyState);
  
  function initialize() {
    console.log('[Preview] Initializing event handlers...');
    bindKnownHandlers();
    bindGenericHandlers();
    console.log('[Preview] Event handlers initialization complete');
  }
  
  // Initialize immediately if DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
  
  // Also try binding after delays for dynamic content
  setTimeout(initialize, 100);
  setTimeout(initialize, 500);
  
  // Expose functions globally for debugging
  (window as any).testStorage = testStorage;
  (window as any).testMessaging = testMessaging;
  (window as any).calculateLove = calculateLove;
  (window as any).bindPreviewHandlers = initialize;
}

// Auto-initialize when script loads
bindPreviewHandlers();

