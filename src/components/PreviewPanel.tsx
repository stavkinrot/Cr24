import React, { useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { useChat } from '../context/ChatContext';
import '../styles/PreviewPanel.css';

const PreviewPanel: React.FC = () => {
  const { generatedExtension, currentChat } = useChat();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const generatedExtensionRef = useRef(generatedExtension);
  const [iframeDimensions, setIframeDimensions] = React.useState({ width: '400px', height: '600px' });

  // Listen for Chrome API requests from sandbox
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data.type === 'CHROME_API_CALL') {
        const { api, method, args, requestId } = event.data;

        try {
          console.log(`Executing Chrome API: chrome.${api}.${method}`, args);

          // Execute the real Chrome API call
          let result;
          if (api === 'tabs' && method === 'query') {
            result = await chrome.tabs.query(args[0]);
          } else if (api === 'tabs' && method === 'sendMessage') {
            // Send message to content script via postMessage and executeScript
            const message = args[1];
            console.log('tabs.sendMessage called with:', args);

            result = await new Promise(async (resolve, reject) => {
              const messageId = 'msg_' + Date.now() + '_' + Math.random();

              // Timeout after 5 seconds
              const timeout = setTimeout(() => {
                reject(new Error('Message timeout: Content script did not respond'));
              }, 5000);

              // Get the tab to send message to
              try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (!tab || !tab.id) {
                  clearTimeout(timeout);
                  reject(new Error('No active tab found'));
                  return;
                }

                console.log('Sending message to content script via executeScript, tab:', tab.id, 'message:', message);

                // Execute script that sends postMessage to content script and waits for response
                const results = await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  world: 'MAIN', // CRITICAL: Must be MAIN world to communicate with content script
                  func: (msg: any, msgId: string) => {
                    return new Promise((resolve) => {
                      console.log('[Page] Sending postMessage to content script:', msg);

                      // Set up listener for response
                      const responseHandler = (event: MessageEvent) => {
                        if (event.data && event.data.source === 'crx-generator-content' && event.data.messageId === msgId) {
                          window.removeEventListener('message', responseHandler);
                          console.log('[Page] Received response from content script:', event.data.response);
                          resolve(event.data.response);
                        }
                      };

                      window.addEventListener('message', responseHandler);

                      // Send message to content script
                      window.postMessage({
                        source: 'crx-generator-popup',
                        messageId: msgId,
                        message: msg
                      }, '*');

                      // Timeout
                      setTimeout(() => {
                        window.removeEventListener('message', responseHandler);
                        resolve(null);
                      }, 4000);
                    });
                  },
                  args: [message, messageId]
                });

                console.log('executeScript results:', results);

                clearTimeout(timeout);

                // Extract result from executeScript response
                if (results && results[0] && results[0].result !== undefined) {
                  resolve(results[0].result);
                } else {
                  reject(new Error('No response from content script'));
                }
              } catch (err) {
                clearTimeout(timeout);
                reject(err);
              }
            });
          } else if (api === 'scripting' && method === 'executeScript') {
            const injectionDetails = args[0];
            console.log('scripting.executeScript called with:', injectionDetails);

            // Check if using file-based injection
            if (injectionDetails.files && Array.isArray(injectionDetails.files)) {
              console.log('File-based injection detected, files:', injectionDetails.files);
              // Transform files into inline code execution
              const fileContents: string[] = [];

              for (const fileName of injectionDetails.files) {
                const content = generatedExtensionRef.current?.files[fileName];
                if (!content) {
                  throw new Error(`Could not find generated file: '${fileName}'`);
                }
                fileContents.push(content);
              }

              const combinedCode = fileContents.join('\n\n');

              // Wrap content script with Chrome API mock for message receiving
              const wrappedCode = `
(function() {
  // Set up chrome.runtime.onMessage for content scripts
  if (!window.chrome) {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {};
  }

  // Create message listener system
  const messageListeners = [];

  window.chrome.runtime.onMessage = {
    addListener: function(callback) {
      messageListeners.push(callback);
      console.log('[Content Script] Message listener registered, total:', messageListeners.length);
    }
  };

  // Listen for messages from the extension
  window.addEventListener('message', function(event) {
    // Only accept messages from same origin with our marker
    if (event.source !== window || !event.data || event.data.source !== 'crx-generator-popup') {
      return;
    }

    console.log('[Content Script] Received message:', event.data);
    const message = event.data.message;

    // Call all registered listeners
    messageListeners.forEach(listener => {
      try {
        listener(message, {}, function(response) {
          // Send response back
          console.log('[Content Script] Sending response:', response);
          window.postMessage({
            source: 'crx-generator-content',
            messageId: event.data.messageId,
            response: response
          }, '*');
        });
      } catch (err) {
        console.error('[Content Script] Error in message listener:', err);
      }
    });
  });

  console.log('[Content Script] Chrome API mock initialized');

  // Execute the actual content script
  ${combinedCode}
})();
              `;

              // Execute using func instead of files
              // Try MAIN world first, fallback to ISOLATED world for ultra-strict CSP sites
              try {
                // Try MAIN world first (allows full page interaction)
                result = await chrome.scripting.executeScript({
                  target: injectionDetails.target,
                  func: (code: string) => {
                    // Try Function constructor first (works on most sites)
                    try {
                      new Function(code)();
                      return { success: true, method: 'Function', world: 'MAIN' };
                    } catch (e1) {
                      // Fallback 1: Try script element (works on sites without Trusted Types)
                      try {
                        const script = document.createElement('script');
                        script.textContent = code;
                        (document.head || document.documentElement).appendChild(script);
                        script.remove();
                        return { success: true, method: 'script', world: 'MAIN' };
                      } catch (e2) {
                        // Fallback 2: Try blob URL (works on some strict CSP sites)
                        try {
                          const blob = new Blob([code], { type: 'text/javascript' });
                          const url = URL.createObjectURL(blob);
                          const script = document.createElement('script');
                          script.src = url;
                          (document.head || document.documentElement).appendChild(script);
                          script.onload = () => URL.revokeObjectURL(url);
                          script.remove();
                          return { success: true, method: 'blob', world: 'MAIN' };
                        } catch (e3) {
                          return { success: false, errors: [(e1 as Error)?.message, (e2 as Error)?.message, (e3 as Error)?.message] };
                        }
                      }
                    }
                  },
                  args: [wrappedCode],
                  world: 'MAIN',
                  injectImmediately: injectionDetails.injectImmediately
                });

                // Check if all methods failed in MAIN world
                if (result && result[0]?.result?.success === false) {
                  console.warn('⚠️ MAIN world injection failed, trying ISOLATED world...');
                  // Fallback to ISOLATED world (has relaxed CSP but limited page access)
                  result = await chrome.scripting.executeScript({
                    target: injectionDetails.target,
                    func: (code: string) => {
                      // In ISOLATED world, Function constructor usually works
                      try {
                        new Function(code)();
                        return { success: true, method: 'Function', world: 'ISOLATED' };
                      } catch (error) {
                        return { success: false, world: 'ISOLATED', error: (error as Error)?.message };
                      }
                    },
                    args: [wrappedCode],
                    world: 'ISOLATED',
                    injectImmediately: injectionDetails.injectImmediately
                  });

                  // If ISOLATED world also failed, show helpful error
                  if (result && result[0]?.result?.success === false) {
                    console.error('❌ Content script injection failed in both MAIN and ISOLATED worlds.');
                    console.error('This page has ultra-strict CSP (Content Security Policy) that blocks all dynamic script injection.');
                    console.error('Sites like LinkedIn require Trusted Types and cannot support dynamically generated extensions.');
                    console.error('The extension will work on most other sites (Wikipedia, GitHub, etc.)');
                  }
                }

                console.log('File-based executeScript completed, result:', result);
              } catch (error) {
                console.error('executeScript failed:', error);
                throw error;
              }
            } else {
              // Pass through func-based injections unchanged
              result = await chrome.scripting.executeScript(injectionDetails);
            }
          } else if (api === 'storage.local' && method === 'get') {
            result = await new Promise(resolve => {
              chrome.storage.local.get(args[0], resolve);
            });
          } else if (api === 'storage.local' && method === 'set') {
            await new Promise<void>(resolve => {
              chrome.storage.local.set(args[0], () => resolve());
            });
            result = {};
          }

          // Send result back to sandbox
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
              type: 'CHROME_API_RESULT',
              requestId,
              result
            }, '*');
          }
        } catch (error: any) {
          console.error('Chrome API call failed:', error);
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
              type: 'CHROME_API_RESULT',
              requestId,
              error: error.message
            }, '*');
          }
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    console.log('PreviewPanel: generatedExtension changed', generatedExtension);
    generatedExtensionRef.current = generatedExtension;
    if (generatedExtension && iframeRef.current) {
      // Inject content scripts into active tab if they exist
      injectContentScripts();
      // Render the popup preview
      renderPreview();
    }
  }, [generatedExtension]);

  const injectContentScripts = async () => {
    if (!generatedExtension) return;

    // Check if extension has content scripts
    const contentScriptFile = generatedExtension.files['content.js'];
    const manifest = generatedExtension.manifest;

    if (!contentScriptFile && !manifest?.content_scripts) {
      console.log('No content scripts to inject');
      return;
    }

    try {
      // Get the active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        console.warn('No active tab found for content script injection');
        return;
      }

      console.log('Injecting content script into active tab:', tab.id);

      // Wrap content script with Chrome API mock (same as in executeScript handler)
      const wrappedCode = `
(function() {
  // Set up chrome.runtime.onMessage for content scripts
  if (!window.chrome) {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {};
  }

  // Create message listener system
  const messageListeners = [];

  window.chrome.runtime.onMessage = {
    addListener: function(callback) {
      messageListeners.push(callback);
      console.log('[Content Script] Message listener registered, total:', messageListeners.length);
    }
  };

  // Listen for messages from the extension
  window.addEventListener('message', function(event) {
    // Only accept messages from same origin with our marker
    if (event.source !== window || !event.data || event.data.source !== 'crx-generator-popup') {
      return;
    }

    console.log('[Content Script] Received message:', event.data);
    const message = event.data.message;

    // Call all registered listeners
    messageListeners.forEach(listener => {
      try {
        listener(message, {}, function(response) {
          // Send response back
          console.log('[Content Script] Sending response:', response);
          window.postMessage({
            source: 'crx-generator-content',
            messageId: event.data.messageId,
            response: response
          }, '*');
        });
      } catch (err) {
        console.error('[Content Script] Error in message listener:', err);
      }
    });
  });

  console.log('[Content Script] Chrome API mock initialized');

  // Execute the actual content script
  ${contentScriptFile}
})();
      `;

      // Inject the content script with fallback to ISOLATED world for ultra-strict CSP
      let injectionResult = await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: manifest?.content_scripts?.[0]?.all_frames || false },
        func: (scriptCode: string) => {
          // Try multiple injection methods to handle different CSP configurations
          try {
            new Function(scriptCode)();
            console.log('Content script injected successfully via Function (MAIN)');
            return { success: true, method: 'Function', world: 'MAIN' };
          } catch (e1) {
            try {
              const script = document.createElement('script');
              script.textContent = scriptCode;
              (document.head || document.documentElement).appendChild(script);
              script.remove();
              console.log('Content script injected successfully via script element (MAIN)');
              return { success: true, method: 'script', world: 'MAIN' };
            } catch (e2) {
              try {
                const blob = new Blob([scriptCode], { type: 'text/javascript' });
                const url = URL.createObjectURL(blob);
                const script = document.createElement('script');
                script.src = url;
                (document.head || document.documentElement).appendChild(script);
                script.onload = () => URL.revokeObjectURL(url);
                script.remove();
                console.log('Content script injected successfully via blob (MAIN)');
                return { success: true, method: 'blob', world: 'MAIN' };
              } catch (e3) {
                console.error('All MAIN world injection methods failed');
                return { success: false, world: 'MAIN' };
              }
            }
          }
        },
        args: [wrappedCode],
        world: 'MAIN'
      });

      // If MAIN world failed, try ISOLATED world
      if (injectionResult && injectionResult[0]?.result?.success === false) {
        console.warn('⚠️ MAIN world injection failed, trying ISOLATED world for content script...');
        const isolatedResult = await chrome.scripting.executeScript({
          target: { tabId: tab.id, allFrames: manifest?.content_scripts?.[0]?.all_frames || false },
          func: (scriptCode: string) => {
            try {
              new Function(scriptCode)();
              console.log('Content script injected successfully via Function (ISOLATED)');
              return { success: true, method: 'Function', world: 'ISOLATED' };
            } catch (error) {
              console.error('ISOLATED world injection also failed:', error);
              return { success: false, world: 'ISOLATED', error: (error as Error)?.message };
            }
          },
          args: [wrappedCode],
          world: 'ISOLATED'
        });

        // If ISOLATED world also failed, show helpful error
        if (isolatedResult && isolatedResult[0]?.result?.success === false) {
          console.error('❌ Content script injection failed in both MAIN and ISOLATED worlds.');
          console.error('⚠️ This page has ultra-strict CSP that blocks all dynamic script injection.');
          console.error('📝 Sites like LinkedIn, Twitter, and some banking sites require Trusted Types.');
          console.error('✅ The extension will work on most other sites (Wikipedia, GitHub, news sites, etc.)');
          console.error('💡 Tip: Download the generated extension and install it as a regular Chrome extension to bypass these restrictions.');
        }
      }

      console.log('Content script injected successfully');
    } catch (error) {
      console.error('Failed to inject content script:', error);
    }
  };

  const extractDimensions = (html: string, css: string = '') => {
    // Try to extract width from CSS - look for ANY element with width (prioritize body/html/main)
    let widthMatch = css.match(/body[^{]*\{[^}]*width:\s*(\d+(?:px|em|rem))/i) ||
                     css.match(/html[^{]*\{[^}]*width:\s*(\d+(?:px|em|rem))/i) ||
                     css.match(/main[^{]*\{[^}]*width:\s*(\d+(?:px|em|rem))/i) ||
                     css.match(/\.container[^{]*\{[^}]*width:\s*(\d+(?:px|em|rem))/i) ||
                     css.match(/width:\s*(\d+px)/i); // Fallback to any width declaration

    // Try to extract height from CSS
    let heightMatch = css.match(/body[^{]*\{[^}]*height:\s*(\d+(?:px|em|rem))/i) ||
                      css.match(/html[^{]*\{[^}]*height:\s*(\d+(?:px|em|rem))/i) ||
                      css.match(/main[^{]*\{[^}]*height:\s*(\d+(?:px|em|rem))/i) ||
                      css.match(/\.container[^{]*\{[^}]*height:\s*(\d+(?:px|em|rem))/i);

    // Try to extract from HTML inline styles
    if (!widthMatch) {
      widthMatch = html.match(/style=["'][^"']*width:\s*(\d+(?:px|em|rem))/i);
    }
    if (!heightMatch) {
      heightMatch = html.match(/style=["'][^"']*height:\s*(\d+(?:px|em|rem))/i);
    }

    // Calculate total dimensions including padding
    let width = widthMatch?.[1] || '400px';
    let height = heightMatch?.[1] || 'auto';

    // Determine which element has the width/height (to extract padding from same element)
    const elementSelector = css.includes('body {') ? 'body' :
                           css.includes('main {') ? 'main' :
                           css.includes('.container {') ? '\\.container' : null;

    if (elementSelector) {
      // Try to extract padding (supports: "padding: 10px 20px", "padding: 10px", etc.)
      const fullPaddingMatch = css.match(new RegExp(`${elementSelector}[^{]*\\{[^}]*padding:\\s*(\\d+)px(?:\\s+(\\d+)px)?(?:\\s+(\\d+)px)?(?:\\s+(\\d+)px)?`, 'i'));

      if (fullPaddingMatch) {
        const top = parseInt(fullPaddingMatch[1]);
        const right = parseInt(fullPaddingMatch[2] || fullPaddingMatch[1]);
        const bottom = parseInt(fullPaddingMatch[3] || fullPaddingMatch[1]);
        const left = parseInt(fullPaddingMatch[4] || fullPaddingMatch[2] || fullPaddingMatch[1]);

        // Add horizontal padding to width
        if (widthMatch) {
          const widthValue = parseInt(width);
          width = `${widthValue + left + right}px`;
        }

        // If no explicit height, don't set one (let it be auto/natural)
        // But if height was set, add vertical padding
        if (heightMatch) {
          const heightValue = parseInt(height);
          height = `${heightValue + top + bottom}px`;
        }
      }
    }

    // If height is auto, use a reasonable default min-height
    if (height === 'auto') {
      height = 'auto'; // Let it grow naturally, but set in render
    }

    console.log('Extracted dimensions:', { width, height, rawWidth: widthMatch?.[1], rawHeight: heightMatch?.[1] });
    return { width, height };
  };

  const renderPreview = () => {
    if (!generatedExtension || !iframeRef.current) return;

    const iframe = iframeRef.current;

    // Function to send HTML to sandbox
    const sendToSandbox = (html: string) => {
      console.log('Sending HTML to sandbox, contentWindow:', iframe.contentWindow);
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'RENDER_HTML', html }, '*');
        console.log('HTML sent to sandbox');
      } else {
        console.error('No contentWindow available');
      }
    };

    if (generatedExtension.files['popup.html']) {
      // Extract dimensions from HTML/CSS
      const dimensions = extractDimensions(
        generatedExtension.files['popup.html'],
        generatedExtension.files['popup.css'] || ''
      );
      setIframeDimensions(dimensions);

      // Render popup
      let html = generatedExtension.files['popup.html'];

      // Remove external CSS/JS references since we'll inject inline
      // Remove <link> tags for CSS
      html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi, '');

      // Remove <script src="..."> tags (but keep inline <script> tags)
      html = html.replace(/<script[^>]*src=["'][^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '');

      // Remove any CSP meta tags that would block inline scripts
      html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');

      // Create a complete HTML document structure if it doesn't have one
      if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
        html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Extension Preview</title>
</head>
<body>
${html}
</body>
</html>`;
      }

      // Inject permissive CSP meta tag to allow inline scripts
      const permissiveCSP = `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';">`;

      // Inject Chrome API mock before any other scripts
      const chromeApiMock = `
        <script>
          // Keep reference to real Chrome API BEFORE any modifications
          const realChrome = window.chrome;

          console.log('Setting up Chrome API bridge to parent');

          // Helper to call parent's Chrome API via postMessage
          function callParentChromeAPI(api, method, args) {
            return new Promise((resolve, reject) => {
              const requestId = 'chrome_' + Date.now() + '_' + Math.random();

              const handleResponse = (event) => {
                if (event.data.type === 'CHROME_API_RESULT' && event.data.requestId === requestId) {
                  window.removeEventListener('message', handleResponse);
                  if (event.data.error) {
                    reject(new Error(event.data.error));
                  } else {
                    resolve(event.data.result);
                  }
                }
              };

              window.addEventListener('message', handleResponse);

              // Send request to parent
              window.parent.postMessage({
                type: 'CHROME_API_CALL',
                api,
                method,
                args,
                requestId
              }, '*');

              // Timeout after 10 seconds
              setTimeout(() => {
                window.removeEventListener('message', handleResponse);
                reject(new Error('Chrome API call timeout'));
              }, 10000);
            });
          }

          // Create Chrome API that bridges to parent
          window.chrome = {
            storage: {
              local: {
                get: function(keys, callback) {
                  callParentChromeAPI('storage.local', 'get', [keys])
                    .then(result => callback && callback(result))
                    .catch(err => console.error('storage.local.get error:', err));
                },
                set: function(items, callback) {
                  callParentChromeAPI('storage.local', 'set', [items])
                    .then(() => callback && callback())
                    .catch(err => console.error('storage.local.set error:', err));
                }
              }
            },
            runtime: {
              sendMessage: function(message, callback) {
                console.log('chrome.runtime.sendMessage not bridged yet');
                if (callback) callback({});
              },
              lastError: null
            },
            tabs: {
              query: async function(queryInfo, callback) {
                try {
                  const result = await callParentChromeAPI('tabs', 'query', [queryInfo]);
                  if (callback) callback(result);
                  return result;
                } catch (err) {
                  console.error('tabs.query error:', err);
                  if (callback) callback([]);
                }
              },
              sendMessage: async function(tabId, message, callback) {
                try {
                  const result = await callParentChromeAPI('tabs', 'sendMessage', [tabId, message]);
                  if (callback) callback(result);
                  return result;
                } catch (err) {
                  console.error('tabs.sendMessage error:', err);
                  window.chrome.runtime.lastError = err;
                  if (callback) callback();
                }
              }
            },
            scripting: {
              executeScript: async function(injection, callback) {
                try {
                  const result = await callParentChromeAPI('scripting', 'executeScript', [injection]);
                  if (callback) callback(result);
                  return result;
                } catch (err) {
                  console.error('scripting.executeScript error:', err);
                  window.chrome.runtime.lastError = err;
                  if (callback) callback();
                  throw err;
                }
              }
            }
          };

          console.log('Chrome API bridge ready');
        </script>
      `;

      // Inject permissive CSP and Chrome API mock into head
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${permissiveCSP}${chromeApiMock}</head>`);
      } else {
        html = permissiveCSP + chromeApiMock + html;
      }

      // Inject CSS if exists
      if (generatedExtension.files['popup.css']) {
        const cssTag = `<style>${generatedExtension.files['popup.css']}</style>`;
        if (html.includes('</head>')) {
          html = html.replace('</head>', `${cssTag}</head>`);
        } else {
          html = cssTag + html;
        }
      }

      // Inject JS if exists
      if (generatedExtension.files['popup.js']) {
        // Wrap in DOMContentLoaded to ensure DOM is ready (mimics defer behavior)
        const wrappedJS = `
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    ${generatedExtension.files['popup.js']}
  });
} else {
  // DOM already loaded
  ${generatedExtension.files['popup.js']}
}
`;
        const scriptTag = `<script>${wrappedJS}</script>`;
        if (html.includes('</body>')) {
          html = html.replace('</body>', `${scriptTag}</body>`);
        } else {
          html = html + scriptTag;
        }
      }

      // Load sandbox page and send HTML via postMessage
      if (!iframe.src || !iframe.src.includes('sandbox.html')) {
        iframe.src = chrome.runtime.getURL('sandbox.html');
        // Wait for sandbox to be ready
        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'SANDBOX_READY') {
            window.removeEventListener('message', handleMessage);
            sendToSandbox(html);
          }
        };
        window.addEventListener('message', handleMessage);
      } else {
        // Sandbox already loaded, send HTML directly
        // Use small timeout to ensure contentWindow is ready
        setTimeout(() => sendToSandbox(html), 50);
      }
    } else if (generatedExtension.files['content.js']) {
      // Render content script on demo page
      const demoHTML = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Demo Page</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 20px;
                line-height: 1.6;
              }
              h1 { color: #333; }
              p { margin: 10px 0; }
            </style>
          </head>
          <body>
            <h1>Demo Web Page</h1>
            <p>This is a sample web page to demonstrate the content script.</p>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>
            <div id="demo-content">
              <p>Content scripts will inject code into this page.</p>
            </div>
            <script>
              // Simulate Chrome API for content scripts
              window.chrome = {
                runtime: {
                  sendMessage: (msg) => console.log('Message sent:', msg),
                  onMessage: {
                    addListener: (callback) => console.log('Listener added')
                  }
                },
                storage: {
                  local: {
                    get: (keys, callback) => callback({}),
                    set: (items, callback) => callback && callback()
                  }
                }
              };

              // Inject content script
              ${generatedExtension.files['content.js']}
            </script>
          </body>
        </html>
      `;

      // Load sandbox page and send demo HTML via postMessage
      if (!iframe.src || !iframe.src.includes('sandbox.html')) {
        iframe.src = chrome.runtime.getURL('sandbox.html');
        // Wait for sandbox to be ready
        const handleMessage = (event: MessageEvent) => {
          if (event.data.type === 'SANDBOX_READY') {
            window.removeEventListener('message', handleMessage);
            sendToSandbox(demoHTML);
          }
        };
        window.addEventListener('message', handleMessage);
      } else {
        // Sandbox already loaded, send HTML directly
        // Use small timeout to ensure contentWindow is ready
        setTimeout(() => sendToSandbox(demoHTML), 50);
      }
    }
  };

  const downloadExtension = async () => {
    if (!generatedExtension) return;

    const zip = new JSZip();

    // Add manifest.json
    zip.file('manifest.json', JSON.stringify(generatedExtension.manifest, null, 2));

    // Add all other files
    Object.entries(generatedExtension.files).forEach(([filename, content]) => {
      zip.file(filename, content);
    });

    // Generate a filename from chat title or use default
    const sanitizeFilename = (name: string) => {
      return name
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50)
        .toLowerCase();
    };

    const zipFilename = currentChat?.title
      ? `${sanitizeFilename(currentChat.title)}.zip`
      : 'chrome-extension.zip';

    // Generate and download zip
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRefresh = () => {
    renderPreview();
  };

  return (
    <div className="preview-panel">
      <div className="preview-header">
        <h3 className="preview-title">Live Preview</h3>
        <button className="refresh-button" onClick={handleRefresh} title="Refresh">
          ↻
        </button>
      </div>
      <div className="preview-content">
        {generatedExtension ? (
          <>
            <div className="preview-frame-container">
              <iframe
                ref={iframeRef}
                className="preview-frame"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                title="Extension Preview"
                style={{
                  pointerEvents: 'auto',
                  cursor: 'auto',
                  width: iframeDimensions.width,
                  height: iframeDimensions.height === 'auto' ? '600px' : iframeDimensions.height,
                  maxWidth: '100%',
                  maxHeight: '100%'
                }}
              />
            </div>
            <div className="preview-footer">
              <button className="download-extension-button" onClick={downloadExtension}>
                Download Extension
              </button>
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <h3>Extension Preview</h3>
            <p>Generate an extension to see it running here</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewPanel;
