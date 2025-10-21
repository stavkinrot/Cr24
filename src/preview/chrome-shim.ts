// Chrome API Shim for Extension Preview
(function() {
  'use strict';
  
  console.log('Loading Chrome API shim in context:', window.location.href);
  console.log('Document ready state:', document.readyState);
  
  let backgroundPort: MessagePort | null = null;
  let messageId = 0;
  const pendingCallbacks = new Map<number, (data: any) => void>();
  
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
          if (callback) callback(data);
        }
      };
      
      console.log('Background messaging port connected');
    }
  });
  
  const chrome = {
    runtime: {
      sendMessage: function(message: any, responseCallback?: (data: any) => void) {
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
        _listeners: [] as any[],
        addListener: function(listener: any) {
          console.log('chrome.runtime.onMessage.addListener called');
          this._listeners.push(listener);
        },
        removeListener: function(listener: any) {
          const index = this._listeners.indexOf(listener);
          if (index > -1) this._listeners.splice(index, 1);
        }
      },
      
      getURL: function(path: string) {
        return 'chrome-extension://preview-extension/' + path.replace(/^\/+/, '');
      },
      
      id: 'preview-extension-id'
    },
    
    storage: {
      local: {
        _storage: new Map<string, any>(),
        get: function(keys: any, callback: (result: any) => void) {
          setTimeout(() => {
            const result: any = {};
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
        
        set: function(items: any, callback?: () => void) {
          setTimeout(() => {
            console.log('chrome.storage.local.set:', items);
            for (const [key, value] of Object.entries(items)) {
              this._storage.set(key, value);
            }
            if (callback) callback();
          }, 1);
        },
        
        clear: function(callback?: () => void) {
          setTimeout(() => {
            console.log('chrome.storage.local.clear');
            this._storage.clear();
            if (callback) callback();
          }, 1);
        },
        
        remove: function(keys: string | string[], callback?: () => void) {
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
      query: function(queryInfo: any, callback: (tabs: any[]) => void) {
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
  
  (window as any).chrome = chrome;
  (globalThis as any).chrome = chrome;
  console.log('Chrome API shim loaded successfully');
})();