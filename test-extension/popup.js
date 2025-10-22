// Test Counter Extension - CSP Compliant
let count = 0;

// Load count from storage
chrome.storage.local.get(['counter'], (result) => {
    if (result.counter !== undefined) {
        count = result.counter;
        updateDisplay();
    }
});

// Event listeners
document.getElementById('increment').addEventListener('click', () => {
    count++;
    updateDisplay();
    saveCount();
    showResult(`Incremented to ${count}`);
});

document.getElementById('decrement').addEventListener('click', () => {
    count--;
    updateDisplay();
    saveCount();
    showResult(`Decremented to ${count}`);
});

document.getElementById('reset').addEventListener('click', () => {
    count = 0;
    updateDisplay();
    saveCount();
    showResult('Reset to 0');
});

function updateDisplay() {
    document.getElementById('counter').textContent = count;
}

function saveCount() {
    chrome.storage.local.set({ counter: count }, () => {
        console.log('Count saved:', count);
    });
}

function showResult(message) {
    const resultDiv = document.getElementById('result');
    resultDiv.textContent = message;
    
    // Clear result after 2 seconds
    setTimeout(() => {
        resultDiv.textContent = '';
    }, 2000);
}

// Test Chrome API functionality
console.log('Test Counter Extension loaded');
console.log('Chrome API available:', typeof chrome !== 'undefined');
console.log('Chrome storage available:', typeof chrome.storage !== 'undefined');

// Test messaging
chrome.runtime.sendMessage({action: 'test', data: 'Hello from test extension'}, (response) => {
    console.log('Message response:', response);
});

