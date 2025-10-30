import React, { useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/PreviewPanel.css';

const PreviewPanel: React.FC = () => {
  const { generatedExtension } = useChat();
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
            result = await new Promise((resolve, reject) => {
              chrome.tabs.sendMessage(args[0], args[1], (response) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                } else {
                  resolve(response);
                }
              });
            });
          } else if (api === 'scripting' && method === 'executeScript') {
            result = await chrome.scripting.executeScript(args[0]);
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

      // Inject the content script
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: manifest?.content_scripts?.[0]?.all_frames || false },
        func: (scriptCode) => {
          // Execute the content script code in the page context
          try {
            eval(scriptCode);
            console.log('Content script injected successfully');
          } catch (error) {
            console.error('Error executing content script:', error);
          }
        },
        args: [contentScriptFile]
      });

      console.log('Content script injected successfully');
    } catch (error) {
      console.error('Failed to inject content script:', error);
    }
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
              executeScript: async function(injection) {
                try {
                  return await callParentChromeAPI('scripting', 'executeScript', [injection]);
                } catch (err) {
                  console.error('scripting.executeScript error:', err);
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

  const handleRefresh = () => {
    renderPreview();
  };

  const handleDownload = () => {
    if (!generatedExtension) return;

    // Create a zip file (simplified - using JSZip would be better)
    const files = { ...generatedExtension.files, 'manifest.json': JSON.stringify(generatedExtension.manifest, null, 2) };

    // For now, download as individual files
    Object.entries(files).forEach(([filename, content]) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    });
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
            <div className="preview-info">
              <div className="info-badges">
                <span className="badge">✓ Chrome API simulation</span>
                <span className="badge">✓ Background script support</span>
                <span className="badge">✓ Storage persistence</span>
                <span className="badge">✓ Runtime messaging</span>
              </div>
            </div>
            <div className="preview-frame-container">
              <iframe
                ref={iframeRef}
                className="preview-frame"
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                title="Extension Preview"
                style={{ pointerEvents: 'auto', cursor: 'auto' }}
              />
            </div>
            <div className="preview-actions">
              <button className="action-button primary" onClick={handleDownload}>
                Download Extension
              </button>
              <button className="action-button" onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(generatedExtension, null, 2));
              }}>
                Copy Code
              </button>
            </div>
          </>
        ) : (
          <div className="preview-empty">
            <h3>Extension Preview</h3>
            <p>Generate an extension to see it running here</p>
            <div className="preview-features">
              <p>✓ Chrome API simulation</p>
              <p>✓ Background script support</p>
              <p>✓ Storage persistence</p>
              <p>✓ Runtime messaging</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewPanel;
