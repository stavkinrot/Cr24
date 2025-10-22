// Chrome API Shim for Extension Preview
// Detects whether running in real extension or preview mode
// This is a standalone module that can be loaded as an external script

(function() {
  'use strict';
  
  console.log('[Chrome Shim] Loading in context:', window.location.href);
  console.log('[Chrome Shim] Document ready state:', document.readyState);
  
  // Detection logic for extension vs preview
  // Check if chrome.runtime.id exists and is not a preview-specific ID
  const isRealExtension = (() => {
    try {
      return typeof chrome !== 'undefined' && 
             chrome.runtime && 
             typeof chrome.runtime.id === 'string' &&
             chrome.runtime.id.length > 0 &&
             !chrome.runtime.id.includes('preview');
    } catch (e) {
      return false;
    }
  })();
  
  console.log('[Chrome Shim] Running in real extension:', isRealExtension);
  
  let backgroundPort: MessagePort | null = null;
  let messageId = 0;
  const pendingCallbacks = new Map<number, (data: any) => void>();
  const messageListeners: Array<(message: any, sender: any, sendResponse: (response?: any) => void) => any> = [];
  
  // Listen for messaging setup from preview runner
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
        } else if (type === 'MESSAGE') {
          // Handle incoming messages from background
          const sender = { id: 'preview-extension-id' };
          for (const listener of messageListeners) {
            try {
              const response = listener(data, sender, (response) => {
                backgroundPort?.postMessage({
                  type: 'RESPONSE',
                  messageId: id,
                  data: response
                });
              });
              
              // Handle synchronous responses
              if (response !== undefined) {
                backgroundPort?.postMessage({
                  type: 'RESPONSE',
                  messageId: id,
                  data: response
                });
              }
            } catch (error) {
              console.error('[Chrome Shim] Message listener error:', error);
            }
          }
        }
      };
      
      console.log('[Chrome Shim] Background messaging port connected');
    }
  });
  
  // Create Chrome API object
  const chromeAPI = {
    runtime: {
      sendMessage: function(message: any, responseCallback?: (data: any) => void) {
        console.log('chrome.runtime.sendMessage called:', message);
        
        if (isRealExtension) {
          // Use real Chrome API
          return (window as any).chrome.runtime.sendMessage(message, responseCallback);
        }
        
        // Preview mode - use message port
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
        _listeners: messageListeners,
        addListener: function(listener: any) {
          console.log('chrome.runtime.onMessage.addListener called');
          if (isRealExtension) {
            return (window as any).chrome.runtime.onMessage.addListener(listener);
          }
          messageListeners.push(listener);
        },
        removeListener: function(listener: any) {
          if (isRealExtension) {
            return (window as any).chrome.runtime.onMessage.removeListener(listener);
          }
          const index = messageListeners.indexOf(listener);
          if (index > -1) messageListeners.splice(index, 1);
        }
      },
      
      getURL: function(path: string) {
        if (isRealExtension) {
          return (window as any).chrome.runtime.getURL(path);
        }
        return 'chrome-extension://preview-extension/' + path.replace(/^\/+/, '');
      },
      
      id: isRealExtension ? (window as any).chrome?.runtime?.id : 'preview-extension-id',
      
      onInstalled: {
        _listeners: [] as any[],
        addListener: function(listener: any) {
          if (isRealExtension) {
            return (window as any).chrome.runtime.onInstalled.addListener(listener);
          }
          this._listeners.push(listener);
          // Manually trigger onInstalled in preview mode
          setTimeout(() => {
            try {
              listener({ reason: 'install' });
            } catch (error) {
              console.error('onInstalled listener error:', error);
            }
          }, 100);
        },
        removeListener: function(listener: any) {
          if (isRealExtension) {
            return (window as any).chrome.runtime.onInstalled.removeListener(listener);
          }
          const index = this._listeners.indexOf(listener);
          if (index > -1) this._listeners.splice(index, 1);
        }
      }
    },
    
    storage: {
      local: {
        _storage: new Map<string, any>(),
        get: function(keys: any, callback: (result: any) => void) {
          if (isRealExtension) {
            return (window as any).chrome.storage.local.get(keys, callback);
          }
          
          setTimeout(() => {
            const result: any = {};
            if (keys === null || keys === undefined) {
              for (const [key, value] of this._storage.entries()) {
                result[key] = value;
              }
            } else if (typeof keys === 'string') {
              if (this._storage.has(keys)) {
                result[key] = this._storage.get(keys);
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
          if (isRealExtension) {
            return (window as any).chrome.storage.local.set(items, callback);
          }
          
          setTimeout(() => {
            console.log('chrome.storage.local.set:', items);
            for (const [key, value] of Object.entries(items)) {
              this._storage.set(key, value);
            }
            if (callback) callback();
          }, 1);
        },
        
        clear: function(callback?: () => void) {
          if (isRealExtension) {
            return (window as any).chrome.storage.local.clear(callback);
          }
          
          setTimeout(() => {
            console.log('chrome.storage.local.clear');
            this._storage.clear();
            if (callback) callback();
          }, 1);
        },
        
        remove: function(keys: string | string[], callback?: () => void) {
          if (isRealExtension) {
            return (window as any).chrome.storage.local.remove(keys, callback);
          }
          
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
        if (isRealExtension) {
          return (window as any).chrome.tabs.query(queryInfo, callback);
        }
        
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
    },
    
    alarms: {
      create: function(name: string, alarmInfo: any) {
        if (isRealExtension) {
          return (window as any).chrome.alarms.create(name, alarmInfo);
        }
        
        // Simulate alarms with setInterval in preview
        console.log('chrome.alarms.create (simulated):', name, alarmInfo);
        const delay = alarmInfo.delayInMinutes ? alarmInfo.delayInMinutes * 60000 : 1000;
        setTimeout(() => {
          // Trigger alarm event
          console.log('Alarm triggered:', name);
          const alarmEvent = { name, scheduledTime: Date.now() + delay };
          for (const listener of chromeAPI.alarms.onAlarm._listeners) {
            try {
              listener(alarmEvent);
            } catch (error) {
              console.error('Alarm listener error:', error);
            }
          }
        }, delay);
      },
      
      onAlarm: {
        _listeners: [] as any[],
        addListener: function(listener: any) {
          if (isRealExtension) {
            return (window as any).chrome.alarms.onAlarm.addListener(listener);
          }
          this._listeners.push(listener);
        },
        removeListener: function(listener: any) {
          if (isRealExtension) {
            return (window as any).chrome.alarms.onAlarm.removeListener(listener);
          }
          const index = this._listeners.indexOf(listener);
          if (index > -1) this._listeners.splice(index, 1);
        }
      }
    },
    
    // Simulate host permissions (not enforced in preview)
    permissions: {
      contains: function(permissions: any, callback: (result: boolean) => void) {
        if (isRealExtension) {
          return (window as any).chrome.permissions.contains(permissions, callback);
        }
        
        // In preview, always return true for host permissions
        setTimeout(() => {
          console.log('chrome.permissions.contains (simulated):', permissions);
          callback(true);
        }, 1);
      },
      
      request: function(permissions: any, callback: (granted: boolean) => void) {
        if (isRealExtension) {
          return (window as any).chrome.permissions.request(permissions, callback);
        }
        
        // In preview, always grant permissions
        setTimeout(() => {
          console.log('chrome.permissions.request (simulated):', permissions);
          callback(true);
        }, 1);
      }
    },
    
    // Simulate notifications API
    notifications: {
      create: function(notificationId: string, options: any, callback?: () => void) {
        if (isRealExtension) {
          return (window as any).chrome.notifications.create(notificationId, options, callback);
        }
        
        // In preview, just log the notification
        console.log('chrome.notifications.create (simulated):', notificationId, options);
        if (callback) callback();
      },
      
      clear: function(notificationId: string, callback?: (wasCleared: boolean) => void) {
        if (isRealExtension) {
          return (window as any).chrome.notifications.clear(notificationId, callback);
        }
        
        console.log('chrome.notifications.clear (simulated):', notificationId);
        if (callback) callback(true);
      }
    },
    
    // Simulate context menus API
    contextMenus: {
      create: function(createProperties: any, callback?: () => void) {
        if (isRealExtension) {
          return (window as any).chrome.contextMenus.create(createProperties, callback);
        }
        
        console.log('chrome.contextMenus.create (simulated):', createProperties);
        if (callback) callback();
      },
      
      remove: function(menuItemId: string, callback?: () => void) {
        if (isRealExtension) {
          return (window as any).chrome.contextMenus.remove(menuItemId, callback);
        }
        
        console.log('chrome.contextMenus.remove (simulated):', menuItemId);
        if (callback) callback();
      }
    }
  };
  
  // Only override if not in real extension
  if (!isRealExtension) {
    (window as any).chrome = chromeAPI;
    (globalThis as any).chrome = chromeAPI;
    console.log('[Chrome Shim] Chrome API override installed for preview mode');
  } else {
    console.log('[Chrome Shim] Using native Chrome APIs (real extension context)');
  }
  
  console.log('[Chrome Shim] Initialization complete. Mode:', isRealExtension ? 'REAL_EXTENSION' : 'PREVIEW');
  
  // Expose detection flag for debugging
  (window as any).__isRealExtension = isRealExtension;
})();