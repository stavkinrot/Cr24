// CSP-compliant popup preview script for extension testing
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
      const elementAny = element as any;
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
  
})();