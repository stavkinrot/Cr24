// preview-runner.ts - Fixed preview runner for extensions
import { createVirtualFS, getFileContent, createPopupHTML, hasBackgroundScript, type VirtualFS, type AIFile } from './virtual-fs.js';

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
   * Creates Chrome API shim script content (to be used in virtual filesystem)
   */
  function getChromeShimContent(): string {
    return `// Chrome API Shim for Extension Preview
(function() {
  'use strict';
  
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
   * Creates popup preview script content
   */
  function getPopupPreviewContent(): string {
    return `// CSP-compliant popup preview script for extension testing
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
  
  // Bind event handlers when DOM is ready
  function bindEventHandlers() {
    const testStorageBtn = document.getElementById('testStorageBtn');
    const testMessagingBtn = document.getElementById('testMessagingBtn');
    const calculateLoveBtn = document.getElementById('calculateLoveBtn');
    
    if (testStorageBtn) {
      testStorageBtn.addEventListener('click', testStorage);
      console.log('Bound testStorage handler');
    }
    
    if (testMessagingBtn) {
      testMessagingBtn.addEventListener('click', testMessaging);
      console.log('Bound testMessaging handler');
    }
    
    if (calculateLoveBtn) {
      calculateLoveBtn.addEventListener('click', calculateLove);
      console.log('Bound calculateLove handler');
    }
    
    // Also handle any existing onclick attributes in a CSP-compliant way
    const elementsWithOnclick = document.querySelectorAll('[onclick]');
    elementsWithOnclick.forEach(element => {
      const onclickAttr = element.getAttribute('onclick');
      const elementAny = element;
      if (onclickAttr && !elementAny._handlerBound) {
        elementAny._handlerBound = true;
        
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
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEventHandlers);
  } else {
    bindEventHandlers();
  }
  
  // Also bind after a short delay for dynamic content
  setTimeout(bindEventHandlers, 100);
  
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
   * Injects CSP-compliant preview scripts into the virtual filesystem
   */
  function injectPreviewScripts(fs: VirtualFS): void {
    // Add Chrome API shim script
    const chromeShimContent = getChromeShimContent();
    const chromeShimBlob = new Blob([chromeShimContent], { type: 'application/javascript' });
    const chromeShimUrl = URL.createObjectURL(chromeShimBlob);
    fs.files.set('chrome-shim.js', chromeShimContent);
    fs.objectUrls.set('chrome-shim.js', chromeShimUrl);
    
    // Add popup preview script
    const popupPreviewContent = getPopupPreviewContent();
    const popupPreviewBlob = new Blob([popupPreviewContent], { type: 'application/javascript' });
    const popupPreviewUrl = URL.createObjectURL(popupPreviewBlob);
    fs.files.set('popup-preview.js', popupPreviewContent);
    fs.objectUrls.set('popup-preview.js', popupPreviewUrl);
    
    console.log('Injected CSP-compliant preview scripts into virtual filesystem');
  }
  
  /**
   * Creates the popup preview in an iframe
   */
  function createPopupPreview(fs: VirtualFS): void {
    console.log('Creating popup preview iframe...');
    const iframe = document.createElement('iframe');
    iframe.className = 'preview-iframe';
    // More permissive sandbox for full functionality
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-top-navigation-by-user-activation';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    
    // Inject CSP-compliant scripts into the virtual filesystem
    injectPreviewScripts(fs);
    
    // Generate HTML with proper base href and external script references
    console.log('Generating popup HTML...');
    let popupHTML = createPopupHTML(fs);
    console.log('Generated HTML length:', popupHTML.length);
    
    // Inject external script references right after <head> opens
    popupHTML = popupHTML.replace(
      /(<head[^>]*>)/i,
      `$1\n<base href="${fs.rootUrl}/">\n<script src="chrome-shim.js"></script>\n<script src="popup-preview.js"></script>`
    );
    
    // Use srcdoc instead of blob URL to avoid CSP issues
    try {
      console.log('Setting iframe content with srcdoc...');
      
      // Set up load handlers
      iframe.onload = () => {
        console.log('Preview iframe loaded successfully');
        setupIframeMessaging(iframe);
        
        // Ensure scripts execute after DOM is ready
        setTimeout(() => {
          try {
            const iframeWindow = iframe.contentWindow;
            const iframeDocument = iframe.contentDocument;
            
            if (iframeWindow && iframeDocument) {
              // Reinitialize any event listeners that may have been lost
              const scripts = iframeDocument.querySelectorAll('script');
              scripts.forEach((script) => {
                if (script.textContent && !script.src) {
                  // Re-execute inline scripts to ensure event handlers are bound
                  const newScript = iframeDocument.createElement('script');
                  newScript.textContent = script.textContent;
                  script.parentNode?.replaceChild(newScript, script);
                }
              });
              
              console.log('Preview scripts reinitialized');
            }
          } catch (err) {
            console.warn('Failed to reinitialize scripts:', err);
          }
        }, 100);
      };
      
      iframe.onerror = (e) => {
        console.error('Iframe loading error:', e);
        showError(new Error('Failed to load preview content'));
      };
      
      // Use srcdoc for better compatibility and script execution
      iframe.srcdoc = popupHTML;
      
    } catch (e) {
      console.error('Failed to set iframe content:', e);
      showError(e instanceof Error ? e : new Error(String(e)));
    }
    
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
   * Updates the preview with a new bundle
   */
  function updateBundle(files: AIFile[]): void {
    try {
      console.log('Preview updateBundle called with files:', files?.length || 0);
      cleanup();
      
      if (!files || files.length === 0) {
        console.log('No files provided, showing placeholder');
        showPlaceholder();
        return;
      }
      
      console.log('Creating virtual FS...');
      currentFS = createVirtualFS(files);
      console.log('Virtual FS created, files available:', Array.from(currentFS.files.keys()));
      
      // Create message channel for popup-background communication
      messageChannel = new MessageChannel();
      
      // Check if there's a background script
      const backgroundInfo = hasBackgroundScript(currentFS);
      console.log('Background script info:', backgroundInfo);
      
      // Start background worker if needed
      if (backgroundInfo.hasBackground && backgroundInfo.scriptPath) {
        console.log('Starting background worker...');
        startBackgroundWorker(currentFS, backgroundInfo.scriptPath);
      }
      
      // Create popup preview
      console.log('Creating popup preview...');
      createPopupPreview(currentFS);
      
    } catch (error) {
      console.error('Failed to update preview:', error);
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