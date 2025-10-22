// DOM Ready Handler for Extension Preview
(function() {
  'use strict';
  
  function waitForDOM(callback: () => void) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', callback);
    } else {
      callback();
    }
  }
  
  // Override addEventListener to ensure DOM is ready
  const originalAddEventListener = Element.prototype.addEventListener;
  Element.prototype.addEventListener = function(type: string, listener: any, options?: any) {
    if (type === 'DOMContentLoaded') {
      waitForDOM(listener);
    } else {
      waitForDOM(() => {
        originalAddEventListener.call(this, type, listener, options);
      });
    }
  };
  
  // Override querySelector to provide better debugging
  const originalQuerySelector = Document.prototype.querySelector;
  Document.prototype.querySelector = function(selector: string) {
    const element = originalQuerySelector.call(this, selector);
    if (!element) {
      console.warn('Element not found:', selector);
    }
    return element;
  };
  
  console.log('DOM ready handler installed');
})();