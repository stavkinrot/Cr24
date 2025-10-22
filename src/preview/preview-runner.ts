// preview-runner.ts - Fixed preview runner for extensions
import { createVirtualFS, getFileContent, getFileUrl, createPopupHTML, hasBackgroundScript, type VirtualFS, type AIFile } from './virtual-fs.js';

export interface PreviewRunner {
  updateBundle(files: AIFile[]): void;
  cleanup(): void;
  refreshPreview(): void;
}

export interface PreviewRunnerOptions {
  container: HTMLElement;
  onError?: (error: Error) => void;
  onBackgroundMessage?: (message: any) => void;
}

/**
 * Creates and manages the extension preview runner
 */
export function createPreviewRunner(options: PreviewRunnerOptions): PreviewRunner {
  const { container, onError, onBackgroundMessage } = options;
  
  let currentFS: VirtualFS | null = null;
  let currentIframe: HTMLIFrameElement | null = null;
  let currentWorker: Worker | null = null;
  let messageChannel: MessageChannel | null = null;
  
  /**
   * Shows placeholder when no bundle is loaded
   */
  function showPlaceholder(): void {
    container.innerHTML = `
      <div class="preview-placeholder">
        <h3>Extension Preview</h3>
        <p>Generate an extension to see it running here</p>
        <div class="preview-features">
          <div>✓ Chrome API simulation</div>
          <div>✓ Background script support</div>
          <div>✓ Storage persistence</div>
          <div>✓ Runtime messaging</div>
        </div>
      </div>
    `;
  }
  
  /**
   * Shows error message
   */
  function showError(error: any): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    container.innerHTML = `
      <div class="preview-error">
        <h4>Preview Error</h4>
        <p>${errorMessage}</p>
        <details>
          <summary>Debug Info</summary>
          <pre>${error instanceof Error ? error.stack || error.message : String(error)}</pre>
        </details>
      </div>
    `;
  }
  
  /**
   * Cleans up resources
   */
  function cleanup(): void {
    // Clean up iframe and any associated blob URLs
    if (currentIframe) {
      // If iframe has a blob URL, revoke it
      if (currentIframe.src && currentIframe.src.startsWith('blob:')) {
        console.log('Cleaning up iframe blob URL:', currentIframe.src);
        URL.revokeObjectURL(currentIframe.src);
      }
      currentIframe.remove();
      currentIframe = null;
    }
    
    // Clean up worker
    if (currentWorker) {
      currentWorker.terminate();
      currentWorker = null;
    }
    
    // Clean up message channel
    if (messageChannel) {
      messageChannel.port1.close();
      messageChannel.port2.close();
      messageChannel = null;
    }
    
    // Clean up virtual filesystem (this also cleans up asset blob URLs)
    if (currentFS) {
      currentFS.cleanup();
      currentFS = null;
    }
  }
  
  /**
   * Gets extension JavaScript files and their blob URLs
   */
  function getExtensionScripts(fs: VirtualFS): { path: string; blobUrl: string }[] {
    const scripts: { path: string; blobUrl: string }[] = [];
    
    // Look for JavaScript files referenced in manifest or common patterns
    const scriptFiles = ['popup.js', 'content.js', 'background.js', 'service_worker.js'];
    
    for (const scriptFile of scriptFiles) {
      const content = getFileContent(fs, scriptFile);
      const blobUrl = fs.objectUrls.get(normalizePath(scriptFile));
      if (content && blobUrl) {
        console.log(`[Preview] Found extension script: ${scriptFile}`);
        scripts.push({ path: scriptFile, blobUrl });
      }
    }
    
    // Also look for any other .js files in the filesystem (excluding preview scripts)
    for (const [path, content] of fs.files.entries()) {
      if (path.endsWith('.js') && 
          !path.includes('__preview__') && 
          !scriptFiles.includes(path)) {
        const blobUrl = fs.objectUrls.get(path);
        if (blobUrl) {
          console.log(`[Preview] Found additional script: ${path}`);
          scripts.push({ path, blobUrl });
        }
      }
    }
    
    return scripts;
  }
  
  /**
   * REMOVED: getChromeShimContent - now loaded from built file
   * Chrome API shim is now bundled as dist/preview/chrome-shim.js
   */
  function getChromeShimContent_DEPRECATED(): string {
    return `// DEPRECATED: Chrome API Shim now loaded from built file
(function() {
  'use strict';
  
  console.log('[DEPRECATED] This inline shim should not be used');
  console.log('Loading Chrome API shim in context:', window.location.href);
  console.log('Document ready state:', document.readyState);
  
  let backgroundPort = null;
  let messageId = 0;
  const pendingCallbacks = new Map();
  
  // Listen for messaging setup
  window.addEventListener('message', function(event) {
    if (event.data.type === 'SETUP_MESSAGING' && event.ports[0]) {
      backgroundPort = event.ports[0];
      
      // Listen for messages from background
      backgroundPort.onmessage = function(e) {
        const { type, messageId: id, data } = e.data;
        if (type === 'RESPONSE' && pendingCallbacks.has(id)) {
          const callback = pendingCallbacks.get(id);
          pendingCallbacks.delete(id);
          callback(data);
        }
      };
      
      console.log('Background messaging port connected');
    }
  });
  
  const chrome = {
    runtime: {
      sendMessage: function(message, responseCallback) {
        console.log('chrome.runtime.sendMessage called:', message);
        
        if (backgroundPort) {
          const id = ++messageId;
          if (responseCallback) {
            pendingCallbacks.set(id, responseCallback);
          }
          
          backgroundPort.postMessage({
            type: 'MESSAGE',
            messageId: id,
            data: message
          });
        } else {
          console.warn('No background port available');
          if (responseCallback) {
            setTimeout(() => responseCallback({ error: 'No background script' }), 1);
          }
        }
      },
      
      onMessage: {
        _listeners: [],
        addListener: function(listener) {
          console.log('chrome.runtime.onMessage.addListener called');
          this._listeners.push(listener);
        },
        removeListener: function(listener) {
          const index = this._listeners.indexOf(listener);
          if (index > -1) this._listeners.splice(index, 1);
        }
      },
      
      getURL: function(path) {
        return 'chrome-extension://preview-extension/' + path.replace(/^\\\\/+/, '');
      },
      
      id: 'preview-extension-id'
    },
    
    storage: {
      local: {
        _storage: new Map(),
        get: function(keys, callback) {
          setTimeout(() => {
            const result = {};
            if (keys === null || keys === undefined) {
              for (const [key, value] of this._storage.entries()) {
                result[key] = value;
              }
            } else if (typeof keys === 'string') {
              if (this._storage.has(keys)) {
                result[keys] = this._storage.get(keys);
              }
            } else if (Array.isArray(keys)) {
              for (const key of keys) {
                if (this._storage.has(key)) {
                  result[key] = this._storage.get(key);
                }
              }
            } else if (typeof keys === 'object' && keys !== null) {
              for (const [key, defaultValue] of Object.entries(keys)) {
                result[key] = this._storage.has(key) ? this._storage.get(key) : defaultValue;
              }
            }
            console.log('chrome.storage.local.get result:', result);
            callback(result);
          }, 1);
        },
        
        set: function(items, callback) {
          setTimeout(() => {
            console.log('chrome.storage.local.set:', items);
            for (const [key, value] of Object.entries(items)) {
              this._storage.set(key, value);
            }
            if (callback) callback();
          }, 1);
        },
        
        clear: function(callback) {
          setTimeout(() => {
            console.log('chrome.storage.local.clear');
            this._storage.clear();
            if (callback) callback();
          }, 1);
        },
        
        remove: function(keys, callback) {
          setTimeout(() => {
            const keyArray = Array.isArray(keys) ? keys : [keys];
            console.log('chrome.storage.local.remove:', keyArray);
            for (const key of keyArray) {
              this._storage.delete(key);
            }
            if (callback) callback();
          }, 1);
        }
      }
    },
    
    tabs: {
      query: function(queryInfo, callback) {
        setTimeout(() => {
          const tabs = [{
            id: 1,
            url: 'https://example.com',
            title: 'Extension Preview Tab',
            active: true,
            windowId: 1,
            index: 0
          }];
          console.log('chrome.tabs.query result:', tabs);
          callback(tabs);
        }, 1);
      }
    }
  };
  
  window.chrome = chrome;
  globalThis.chrome = chrome;
  console.log('Chrome API shim loaded successfully');
})();`;
  }
  
  /**
   * REMOVED: getPopupPreviewContent - now loaded from built file
   * DOM handlers are now bundled as dist/preview/dom-handlers.js
   */
  function getPopupPreviewContent_DEPRECATED(): string {
    return `// DEPRECATED: DOM handlers now loaded from built file
(function() {
  'use strict';
  
  console.log('Extension popup preview script loaded');
  
  // Test functions for extension preview
  function testStorage() {
    console.log('Testing storage...');
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({test: 'Hello World', timestamp: Date.now()}, () => {
        chrome.storage.local.get(['test', 'timestamp'], (result) => {
          console.log('Storage test result:', result);
          const resultDiv = document.getElementById('result');
          if (resultDiv) {
            resultDiv.innerHTML = 'Storage test: ' + JSON.stringify(result, null, 2);
          }
        });
      });
    } else {
      console.warn('Chrome storage API not available');
      const resultDiv = document.getElementById('result');
      if (resultDiv) {
        resultDiv.innerHTML = 'Chrome storage API not available';
      }
    }
  }
  
  function testMessaging() {
    console.log('Testing chrome.runtime.sendMessage...');
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({action: 'test', data: 'Hello from popup'}, (response) => {
        console.log('Message response:', response);
        const resultDiv = document.getElementById('result');
        if (resultDiv) {
          resultDiv.innerHTML = 'Message response: ' + JSON.stringify(response, null, 2);
        }
      });
    } else {
      console.warn('Chrome runtime API not available');
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
  
  // Enhanced event binding with better error handling
  function bindEventHandlers() {
    console.log('Binding event handlers...');
    
    // Bind specific button handlers
    const testStorageBtn = document.getElementById('testStorageBtn');
    const testMessagingBtn = document.getElementById('testMessagingBtn');
    const calculateLoveBtn = document.getElementById('calculateLoveBtn');
    
    if (testStorageBtn && !testStorageBtn._handlerBound) {
      testStorageBtn.addEventListener('click', testStorage);
      testStorageBtn._handlerBound = true;
      console.log('Bound testStorage handler');
    }
    
    if (testMessagingBtn && !testMessagingBtn._handlerBound) {
      testMessagingBtn.addEventListener('click', testMessaging);
      testMessagingBtn._handlerBound = true;
      console.log('Bound testMessaging handler');
    }
    
    if (calculateLoveBtn && !calculateLoveBtn._handlerBound) {
      calculateLoveBtn.addEventListener('click', calculateLove);
      calculateLoveBtn._handlerBound = true;
      console.log('Bound calculateLove handler');
    }
    
    // Handle any existing onclick attributes in a CSP-compliant way
    const elementsWithOnclick = document.querySelectorAll('[onclick]');
    elementsWithOnclick.forEach(element => {
      const onclickAttr = element.getAttribute('onclick');
      if (onclickAttr && !element._handlerBound) {
        element._handlerBound = true;
        
        // Remove the onclick attribute to avoid CSP violations
        element.removeAttribute('onclick');
        
        // Bind known handlers based on onclick content
        if (onclickAttr.includes('testStorage')) {
          element.addEventListener('click', testStorage);
        } else if (onclickAttr.includes('testMessaging')) {
          element.addEventListener('click', testMessaging);
        } else if (onclickAttr.includes('calculateLove')) {
          element.addEventListener('click', calculateLove);
        } else {
          console.warn('Unknown onclick handler:', onclickAttr);
        }
      }
    });
    
    // Also bind to any buttons with common patterns
    const allButtons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    allButtons.forEach(button => {
      if (!button._handlerBound) {
        button._handlerBound = true;
        
        // Check button text or id for common patterns
        const text = button.textContent || button.value || '';
        const id = button.id || '';
        
        if (text.toLowerCase().includes('storage') || id.includes('storage')) {
          button.addEventListener('click', testStorage);
        } else if (text.toLowerCase().includes('message') || id.includes('message')) {
          button.addEventListener('click', testMessaging);
        } else if (text.toLowerCase().includes('love') || id.includes('love')) {
          button.addEventListener('click', calculateLove);
        } else if (text.toLowerCase().includes('test') || id.includes('test')) {
          // Generic test button - try storage first
          button.addEventListener('click', testStorage);
        }
      }
    });
    
    console.log('Event handlers binding complete');
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEventHandlers);
  } else {
    bindEventHandlers();
  }
  
  // Also bind after delays for dynamic content
  setTimeout(bindEventHandlers, 100);
  setTimeout(bindEventHandlers, 500);
  
  // Expose functions globally for debugging
  window.testStorage = testStorage;
  window.testMessaging = testMessaging;
  window.calculateLove = calculateLove;
  
})();`;
  }
  
  /**
   * Sets up messaging between iframe and background worker
   */
  function setupIframeMessaging(iframe: HTMLIFrameElement): void {
    if (!messageChannel || !iframe.contentWindow) {
      console.warn('Cannot setup messaging - missing channel or iframe window');
      return;
    }
    
    // Wait a bit for iframe to fully initialize when using blob URLs
    setTimeout(() => {
      if (iframe.contentWindow && messageChannel) {
        // Transfer port to iframe for direct communication with background
        iframe.contentWindow.postMessage(
          { type: 'SETUP_MESSAGING', port: messageChannel.port1 },
          '*',
          [messageChannel.port1]
        );
        
        console.log('Messaging setup complete between iframe and background');
      } else {
        console.warn('Iframe content window no longer available for messaging setup');
      }
    }, 100); // Small delay to ensure iframe is ready
  }
  
  /**
   * Helper to normalize paths
   */
  function normalizePath(path: string): string {
    return path.replace(/^\.?\/*/, '');
  }

  /**
   * REMOVED: injectPreviewScripts - preview scripts now loaded from built files
   * Preview scripts are added to VirtualFS during createVirtualFS()
   */
  
  /**
   * Creates the popup preview in an iframe using Blob URLs with external scripts only
   */
  function createPopupPreview(fs: VirtualFS): void {
    console.log('[Preview] Creating popup preview iframe...');
    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    // Sandbox the host frame but keep same-origin so it can create blob: iframes
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    
    // Resolve host URL: prefer Vite dev server, fallback to packaged host
    const resolveHostUrl = async (): Promise<string> => {
      const candidates = [
        'http://127.0.0.1:5173/src/preview/preview-host.html',
        'http://localhost:5173/src/preview/preview-host.html'
      ];
      for (const url of candidates) {
        try {
          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 400);
          const resp = await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: ctrl.signal as any });
          clearTimeout(t);
          // no-cors HEAD won't expose ok; assume reachable if no network error
          return url;
        } catch {}
      }
      return chrome.runtime.getURL('src/preview/preview-host.html');
    };

    // Load host and post files for previewing
    (async () => {
      try {
        const hostUrl = await resolveHostUrl();
        iframe.onload = () => {
          try {
            iframe.contentWindow?.postMessage({ type: 'PREVIEW_FILES', files: Array.from(fs.files.entries()).map(([path, content]) => ({ path, content })) }, '*');
            setupIframeMessaging(iframe);
          } catch (err) {
            console.error('[Preview] Failed to post files to host:', err);
          }
        };
        iframe.src = hostUrl;
      } catch (e) {
        console.error('Failed to load preview host:', e);
        showError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    
    container.innerHTML = '';
    container.appendChild(iframe);
    currentIframe = iframe;
    console.log('Iframe added to container');
  }
  
  /**
   * Starts the background worker with proper error handling
   */
  function startBackgroundWorker(fs: VirtualFS, scriptPath: string): void {
    try {
      const scriptContent = getFileContent(fs, scriptPath);
      if (!scriptContent) {
        console.warn('Background script not found:', scriptPath);
        return;
      }
      
      console.log('Background script content length:', scriptContent.length);
      
      if (!messageChannel) {
        console.error('No message channel available for background worker');
        return;
      }
      
      // Simple, robust worker script
      const workerScript = `
        console.log('Background worker starting...');
        
        // Simple Chrome API for background
        const chrome = {
          runtime: {
            sendMessage: function(message, responseCallback) {
              console.log('Background sendMessage:', message);
              if (responseCallback) {
                setTimeout(() => responseCallback({ success: true }), 1);
              }
            },
            onMessage: {
              _listeners: [],
              addListener: function(listener) {
                console.log('Background onMessage.addListener');
                this._listeners.push(listener);
              },
              removeListener: function(listener) {
                const index = this._listeners.indexOf(listener);
                if (index > -1) this._listeners.splice(index, 1);
              }
            },
            getURL: function(path) {
              return 'chrome-extension://preview-extension/' + path.replace(/^\\/+/, '');
            },
            id: 'preview-extension-id'
          },
          onInstalled: {
            _listeners: [],
            addListener: function(listener) {
              this._listeners.push(listener);
              // Trigger install event once in preview
              try { listener({ reason: 'install' }); } catch (e) { /* noop */ }
            },
            removeListener: function(listener) {
              const index = this._listeners.indexOf(listener);
              if (index > -1) this._listeners.splice(index, 1);
            }
          },
          storage: {
            local: {
              _storage: new Map(),
              get: function(keys, callback) {
                setTimeout(() => {
                  const result = {};
                  if (typeof keys === 'string') {
                    if (this._storage.has(keys)) {
                      result[keys] = this._storage.get(keys);
                    }
                  } else if (Array.isArray(keys)) {
                    for (const key of keys) {
                      if (this._storage.has(key)) {
                        result[key] = this._storage.get(key);
                      }
                    }
                  } else if (typeof keys === 'object' && keys !== null) {
                    for (const [key, defaultValue] of Object.entries(keys)) {
                      result[key] = this._storage.has(key) ? this._storage.get(key) : defaultValue;
                    }
                  }
                  callback(result);
                }, 1);
              },
              set: function(items, callback) {
                setTimeout(() => {
                  for (const [key, value] of Object.entries(items)) {
                    this._storage.set(key, value);
                  }
                  if (callback) callback();
                }, 1);
              },
              clear: function(callback) {
                setTimeout(() => {
                  this._storage.clear();
                  if (callback) callback();
                }, 1);
              }
            }
          }
        };
        
        self.chrome = chrome;
        globalThis.chrome = chrome;
        
        // Set up message port communication
        let popupPort = null;
        
        self.onmessage = function(e) {
          if (e.data.type === 'SETUP_PORT' && e.ports[0]) {
            popupPort = e.ports[0];
            
            popupPort.onmessage = function(event) {
              const { type, messageId, data } = event.data;
              
              if (type === 'MESSAGE') {
                console.log('Background received message:', data);
                
                // Trigger onMessage listeners
                if (chrome.runtime.onMessage._listeners.length > 0) {
                  const listeners = chrome.runtime.onMessage._listeners;
                  for (const listener of listeners) {
                    try {
                      const response = listener(data, { id: 'preview-extension-id' }, (response) => {
                        popupPort.postMessage({
                          type: 'RESPONSE',
                          messageId: messageId,
                          data: response
                        });
                      });
                      
                      // Handle synchronous responses
                      if (response !== undefined) {
                        popupPort.postMessage({
                          type: 'RESPONSE',
                          messageId: messageId,
                          data: response
                        });
                      }
                    } catch (error) {
                      console.error('Background listener error:', error);
                      popupPort.postMessage({
                        type: 'RESPONSE',
                        messageId: messageId,
                        data: { error: error.message }
                      });
                    }
                  }
                } else {
                  // No listeners, send default response
                  popupPort.postMessage({
                    type: 'RESPONSE',
                    messageId: messageId,
                    data: { success: true, note: 'No background listeners' }
                  });
                }
              }
            };
            
            console.log('Background worker port connected');
          }
        };
        
        // Execute background script
        console.log('Executing background script...');
        try {
          ${scriptContent}
          console.log('Background script executed successfully');
        } catch (error) {
          console.error('Background script error:', error);
          self.postMessage({ type: 'error', data: error.message });
        }
      `;
      
      // Create worker
      const blob = new Blob([workerScript], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      
      console.log('Creating background worker...');
      currentWorker = new Worker(workerUrl);
      
      // Set up worker communication
      currentWorker.onmessage = (e) => {
        console.log('Worker message:', e.data);
        if (e.data.type === 'error' && onError) {
          onError(new Error(`Background error: ${e.data.data}`));
        }
      };
      
      currentWorker.onerror = (error) => {
        console.error('Worker error:', error);
        if (onError) {
          onError(new Error('Background worker failed to start'));
        }
      };
      
      // Transfer message channel port to worker
      currentWorker.postMessage(
        { type: 'SETUP_PORT', port: messageChannel.port2 }, 
        [messageChannel.port2]
      );
      
      // Clean up blob URL
      setTimeout(() => URL.revokeObjectURL(workerUrl), 1000);
      
      console.log('Background worker created successfully');
      
    } catch (error) {
      console.error('Failed to create background worker:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  
  /**
   * Simulates content script injection into the host page
   */
  function simulateContentScript(fs: VirtualFS): void {
    const manifestContent = getFileContent(fs, 'manifest.json');
    if (!manifestContent) return;
    
    try {
      const manifest = JSON.parse(manifestContent);
      const contentScripts = manifest.content_scripts || [];
      
      for (const script of contentScripts) {
        const jsFiles = script.js || [];
        for (const jsFile of jsFiles) {
          const scriptContent = getFileContent(fs, jsFile);
          if (scriptContent) {
            console.log(`Simulating content script: ${jsFile}`);
            
            // Create a script element and inject it into the preview iframe
            if (currentIframe && currentIframe.contentWindow) {
              const script = currentIframe.contentDocument?.createElement('script');
              if (script) {
                script.textContent = scriptContent;
                currentIframe.contentDocument?.head.appendChild(script);
                console.log(`Content script ${jsFile} injected into preview`);
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to simulate content scripts:', error);
    }
  }
  
  /**
   * Updates the preview with a new bundle
   */
  async function updateBundle(files: AIFile[]): Promise<void> {
    try {
      console.log('[Preview] updateBundle called with files:', files?.length || 0);
      cleanup();
      
      if (!files || files.length === 0) {
        console.log('[Preview] No files provided, showing placeholder');
        showPlaceholder();
        return;
      }
      
      console.log('[Preview] Creating virtual FS...');
      currentFS = await createVirtualFS(files);
      console.log('[Preview] Virtual FS created, files available:', Array.from(currentFS.files.keys()));
      
      // Create message channel for popup-background communication
      messageChannel = new MessageChannel();
      
      // Check if there's a background script
      const backgroundInfo = hasBackgroundScript(currentFS);
      console.log('[Preview] Background script info:', backgroundInfo);
      
      // Start background worker if needed
      if (backgroundInfo.hasBackground && backgroundInfo.scriptPath) {
        console.log('[Preview] Starting background worker...');
        startBackgroundWorker(currentFS, backgroundInfo.scriptPath);
      }
      
      // Create popup preview
      console.log('[Preview] Creating popup preview...');
      createPopupPreview(currentFS);
      
      // Simulate content scripts after iframe loads
      setTimeout(() => {
        if (currentFS) {
          simulateContentScript(currentFS);
        }
      }, 500);
      
    } catch (error) {
      console.error('[Preview] Failed to update preview:', error);
      if (onError) {
        onError(error instanceof Error ? error : new Error(String(error)));
      }
      showError(error);
    }
  }
  
  /**
   * Refreshes the current preview
   */
  function refreshPreview(): void {
    if (currentFS) {
      const files = Array.from(currentFS.files.entries()).map(([path, content]) => ({ path, content }));
      updateBundle(files);
    }
  }
  
  // Initialize with placeholder
  showPlaceholder();
  
  return {
    updateBundle,
    cleanup,
    refreshPreview
  };
}