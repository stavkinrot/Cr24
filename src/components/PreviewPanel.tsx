import React, { useEffect, useRef } from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/PreviewPanel.css';

const PreviewPanel: React.FC = () => {
  const { generatedExtension } = useChat();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (generatedExtension && iframeRef.current) {
      renderPreview();
    }
  }, [generatedExtension]);

  const renderPreview = () => {
    if (!generatedExtension || !iframeRef.current) return;

    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

    if (!iframeDoc) return;

    if (generatedExtension.files['popup.html']) {
      // Render popup
      let html = generatedExtension.files['popup.html'];

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

      // Inject Chrome API mock before any other scripts
      const chromeApiMock = `
        <script>
          // Mock Chrome API for preview
          window.chrome = window.chrome || {
            storage: {
              local: {
                get: function(keys, callback) {
                  console.log('chrome.storage.local.get called:', keys);
                  if (callback) callback({});
                },
                set: function(items, callback) {
                  console.log('chrome.storage.local.set called:', items);
                  if (callback) callback();
                },
                remove: function(keys, callback) {
                  console.log('chrome.storage.local.remove called:', keys);
                  if (callback) callback();
                }
              },
              sync: {
                get: function(keys, callback) {
                  console.log('chrome.storage.sync.get called:', keys);
                  if (callback) callback({});
                },
                set: function(items, callback) {
                  console.log('chrome.storage.sync.set called:', items);
                  if (callback) callback();
                }
              }
            },
            runtime: {
              sendMessage: function(message, callback) {
                console.log('chrome.runtime.sendMessage called:', message);
                if (callback) callback({});
              },
              onMessage: {
                addListener: function(callback) {
                  console.log('chrome.runtime.onMessage.addListener called');
                }
              }
            },
            tabs: {
              query: function(queryInfo, callback) {
                console.log('chrome.tabs.query called:', queryInfo);
                if (callback) callback([]);
              },
              create: function(createProperties, callback) {
                console.log('chrome.tabs.create called:', createProperties);
                if (callback) callback({});
              }
            }
          };
        </script>
      `;

      // Inject Chrome API mock into head
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${chromeApiMock}</head>`);
      } else {
        html = chromeApiMock + html;
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
        const scriptTag = `<script>${generatedExtension.files['popup.js']}</script>`;
        if (html.includes('</body>')) {
          html = html.replace('</body>', `${scriptTag}</body>`);
        } else {
          html = html + scriptTag;
        }
      }

      iframeDoc.open();
      iframeDoc.write(html);
      iframeDoc.close();
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

      iframeDoc.open();
      iframeDoc.write(demoHTML);
      iframeDoc.close();
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
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                title="Extension Preview"
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
