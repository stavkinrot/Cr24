import React, { createContext, useContext, useState, useEffect } from 'react';
import { Chat, Message, Settings, GeneratedExtension } from '../types';
import { validateExtension, formatValidationErrors } from '../utils/extensionValidator';
import { validateExtensionJavaScript, formatSyntaxErrors } from '../utils/syntaxValidator';

interface ChatContextType {
  currentChat: Chat | null;
  chats: Chat[];
  settings: Settings;
  generatedExtension: GeneratedExtension | null;
  createNewChat: () => void;
  selectChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;
  sendMessage: (content: string) => Promise<void>;
  updateSettings: (settings: Partial<Settings>) => void;
  setGeneratedExtension: (extension: GeneratedExtension | null) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [settings, setSettings] = useState<Settings>({
    apiKey: '',
    model: 'gpt-5',
    temperature: 1.0,
  });
  const [generatedExtension, setGeneratedExtension] = useState<GeneratedExtension | null>(null);

  useEffect(() => {
    // Load data from chrome storage
    chrome.storage.local.get(['chats', 'currentChatId', 'settings'], (result) => {
      if (result.chats && result.chats.length > 0) {
        setChats(result.chats);
        if (result.currentChatId) {
          const chat = result.chats.find((c: Chat) => c.id === result.currentChatId);
          if (chat) {
            setCurrentChat(chat);
            // Load the extension from the chat if it exists
            if (chat.generatedExtension) {
              setGeneratedExtension(chat.generatedExtension);
            }
          } else {
            // Current chat not found, select the first chat
            setCurrentChat(result.chats[0]);
            if (result.chats[0].generatedExtension) {
              setGeneratedExtension(result.chats[0].generatedExtension);
            }
          }
        } else {
          // No current chat selected, select the first one
          setCurrentChat(result.chats[0]);
          if (result.chats[0].generatedExtension) {
            setGeneratedExtension(result.chats[0].generatedExtension);
          }
        }
      } else {
        // No chats exist, create a new one
        const newChat: Chat = {
          id: Date.now().toString(),
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          generatedExtension: null,
        };
        setChats([newChat]);
        setCurrentChat(newChat);
        chrome.storage.local.set({ chats: [newChat], currentChatId: newChat.id });
      }
      if (result.settings) {
        setSettings(result.settings);
      }
    });
  }, []);

  const createNewChat = () => {
    const newChat: Chat = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      generatedExtension: null,
    };
    const updatedChats = [newChat, ...chats];
    setChats(updatedChats);
    setCurrentChat(newChat);
    setGeneratedExtension(null);
    chrome.storage.local.set({ chats: updatedChats, currentChatId: newChat.id });
  };

  const selectChat = (chatId: string) => {
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      setCurrentChat(chat);
      setGeneratedExtension(chat.generatedExtension || null);
      chrome.storage.local.set({ currentChatId: chatId });
    }
  };

  const deleteChat = (chatId: string) => {
    const updatedChats = chats.filter((c) => c.id !== chatId);
    setChats(updatedChats);
    if (currentChat?.id === chatId) {
      setCurrentChat(updatedChats[0] || null);
    }
    chrome.storage.local.set({ chats: updatedChats });
  };

  const sendMessage = async (content: string) => {
    if (!currentChat || !settings.apiKey) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    const updatedMessages = [...currentChat.messages, userMessage];
    const updatedChat = {
      ...currentChat,
      messages: updatedMessages,
      updatedAt: Date.now(),
      title: currentChat.messages.length === 0 ? content.substring(0, 50) : currentChat.title,
    };

    setCurrentChat(updatedChat);
    const updatedChats = chats.map((c) => (c.id === currentChat.id ? updatedChat : c));
    setChats(updatedChats);
    chrome.storage.local.set({ chats: updatedChats });

    // Create placeholder assistant message for streaming
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    const messagesWithAssistant = [...updatedMessages, assistantMessage];
    const chatWithAssistant = { ...updatedChat, messages: messagesWithAssistant };
    setCurrentChat(chatWithAssistant);

    // Call OpenAI API with streaming (disabled for GPT-5 due to organization verification requirement)
    try {
      // GPT-5 only supports temperature of 1
      const effectiveTemperature = settings.model === 'gpt-5' ? 1 : settings.temperature;

      // Disable streaming for all models - use non-streaming mode with progress stages
      const useStreaming = false;

      console.log('Calling OpenAI API with model:', settings.model, useStreaming ? '(streaming enabled)' : '(streaming disabled)');
      console.log('API Key starts with:', settings.apiKey.substring(0, 10) + '...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      const systemPrompt = `You are an expert Chrome extension developer. Generate complete, working, BEAUTIFUL Chrome extension code based on user requirements.

IMPORTANT: Your response should have TWO parts:

1. A short, friendly summary (2-3 sentences) describing what the extension does
2. The complete extension code in JSON format

Format your response like this:
Created a [Extension Name] Chrome extension that [brief description of functionality].

\`\`\`json
{
  "manifest": {
    "manifest_version": 3,
    "name": "Extension Name",
    "version": "1.0.0",
    "description": "...",
    "action": { "default_popup": "popup.html" },
    "content_scripts": [
      {
        "matches": ["<all_urls>"],
        "js": ["content.js"]
      }
    ]
  },
  "files": {
    "popup.html": "complete HTML code here",
    "popup.js": "complete JavaScript code here",
    "popup.css": "complete CSS code here",
    "content.js": "complete content script code here"
  },
  "type": "popup"
}
\`\`\`

CRITICAL REQUIREMENTS:

1. EXACT FILE STRUCTURE (MANDATORY):
   ⚠️ IMPORTANT: Every extension has EXACTLY 5 components:

   **1. manifest** (separate field in JSON response):
   - Contains manifest.json content
   - Required fields: manifest_version, name, version, description, action, content_scripts

   **2-5. files** (exactly 4 files in the "files" object):
   - "popup.html" - The popup interface HTML
   - "popup.css" - The popup styles (external modular CSS)
   - "popup.js" - The popup JavaScript logic
   - "content.js" - Content script that runs on web pages

   ❌ DO NOT create additional files in "files" object (no background.js, no icons, no extra scripts)
   ❌ DO NOT omit any of these 4 files - all MUST be present
   ❌ DO NOT put manifest.json in the "files" object - it's a separate "manifest" field

2. MANIFEST VALIDATION:
   - manifest_version MUST be 3
   - MUST include: name (max 45 chars), version (x.y.z format), description
   - MUST declare "action": { "default_popup": "popup.html" }
   - MUST declare "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content.js"] }]
   - Adjust "matches" pattern based on extension purpose (use specific URLs if needed)
   - PERMISSIONS: Use "activeTab" permission (NOT "tabs") when popup needs to communicate with content scripts
     Example: "permissions": ["activeTab"]
     ⚠️ CRITICAL: "activeTab" is required for chrome.tabs.sendMessage() and chrome.tabs.query()
     ❌ DO NOT use "tabs" permission - it requires additional host permissions

3. FILE REFERENCES (CRITICAL):
   - popup.html MUST reference LOCAL files: <link href="popup.css"> and <script src="popup.js">
   - NO external CDN links (no https://, no http://, no //)
   - All referenced files MUST be exactly: popup.css, popup.js
   - content.js MUST be declared in manifest.content_scripts

4. BEAUTIFUL UI DESIGN SYSTEM:
   Use EXTERNAL MODULAR CSS with design tokens in popup.css:

   /* Design Tokens */
   :root {
     --primary-color: #4f46e5;
     --primary-hover: #4338ca;
     --secondary-color: #8b5cf6;
     --bg-color: #ffffff;
     --surface-color: #f9fafb;
     --text-color: #1f2937;
     --text-secondary: #6b7280;
     --border-color: #e5e7eb;
     --border-radius: 8px;
     --spacing-xs: 4px;
     --spacing-sm: 8px;
     --spacing-md: 16px;
     --spacing-lg: 24px;
     --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
     --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
     --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.1);
   }

   body {
     font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
     margin: 0;
     padding: var(--spacing-md);
     background: var(--bg-color);
     color: var(--text-color);
     width: 400px; /* Standard popup width */
   }

   /* Modern Button Style */
   button {
     background: var(--primary-color);
     color: white;
     border: none;
     padding: var(--spacing-sm) var(--spacing-md);
     border-radius: var(--border-radius);
     cursor: pointer;
     font-size: 14px;
     font-weight: 500;
     transition: all 0.2s;
     box-shadow: var(--shadow-sm);
   }

   button:hover {
     background: var(--primary-hover);
     box-shadow: var(--shadow-md);
     transform: translateY(-1px);
   }

   button:active {
     transform: translateY(0);
   }

   /* Modern Input Style */
   input, textarea, select {
     width: 100%;
     padding: var(--spacing-sm);
     border: 1px solid var(--border-color);
     border-radius: var(--border-radius);
     font-size: 14px;
     transition: border-color 0.2s;
   }

   input:focus, textarea:focus, select:focus {
     outline: none;
     border-color: var(--primary-color);
     box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
   }

   /* Card Style */
   .card {
     background: var(--surface-color);
     border-radius: var(--border-radius);
     padding: var(--spacing-md);
     box-shadow: var(--shadow-sm);
     margin-bottom: var(--spacing-md);
   }

5. HTML BEST PRACTICES:
   - Use semantic HTML5: <header>, <main>, <section>, <article>
   - Proper heading hierarchy: h1 → h2 → h3
   - Labels for all form inputs: <label for="id">Label</label>
   - ARIA labels for accessibility: aria-label, aria-describedby
   - Use Flexbox/Grid for layouts (NO tables for layout)

6. CODE QUALITY:
   - Be concise but complete - avoid unnecessary verbosity
   - Include error handling in JavaScript
   - Add loading states for async operations
   - Validate user inputs
   - Use modern JavaScript (ES6+): const/let, arrow functions, async/await
   - Add helpful comments for complex logic
   - SCRIPT PLACEMENT: Place <script src="popup.js"> at END of <body> (before </body>)
   - This ensures DOM is ready without needing DOMContentLoaded
   - If you must access DOM elements, either place script at end OR use DOMContentLoaded
   - Example with script at end: <body>...<script src="popup.js"></script></body>

   CRITICAL - CHROME API USAGE:
   - ALWAYS use modern Promise-based Chrome APIs (not callbacks):
     ✅ const result = await chrome.storage.local.get(key);
     ✅ await chrome.storage.local.set({ key: value });
     ❌ chrome.storage.local.get(key, callback); // Avoid callbacks

   - For reactive updates, use chrome.storage.onChanged:
     chrome.storage.onChanged.addListener((changes, area) => {
       if (area === 'local' && changes.myKey) {
         // React to storage changes
       }
     });

   - Badge API (optional, for showing timer/count in extension icon):
     chrome.action.setBadgeText({ text: '5' });
     chrome.action.setBadgeBackgroundColor({ color: '#4285f4' });

7. RESPONSIVENESS:
   - Design for 400px-600px width (standard Chrome popup sizes)
   - Use flexible layouts that adapt to content
   - Test with various content lengths

8. CONTENT SCRIPT GUIDELINES:
   - content.js runs on web pages specified in manifest.content_scripts.matches
   - Can interact with page DOM, modify elements, listen to events
   - Has access to chrome.runtime.sendMessage() to communicate with popup
   - Should be lightweight and non-intrusive
   - If extension doesn't need to modify web pages, content.js can be minimal (just a comment explaining it's unused)
   - ⚠️ CRITICAL: chrome.runtime.onMessage.addListener() MUST return true to keep message channel open
   - Without return true, sendResponse() will fail silently
   - Example:
     chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
       // handle message
       sendResponse({ result: 'data' });
       return true; // REQUIRED - keeps channel open for async responses
     });

Make sure:
- The summary is conversational and explains what you built
- All code is production-ready and follows Chrome extension best practices
- Include all necessary files (HTML, CSS, JS)
- Use manifest version 3
- ALWAYS use local file references (popup.css, popup.js) - NEVER use CDN links`;

      // Build request body with model-specific token limit parameter
      const requestBody: any = {
        model: settings.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature: effectiveTemperature,
        stream: useStreaming,
      };

      // Set model-specific token limits based on each model's maximum
      // GPT-5 uses max_completion_tokens, others use max_tokens
      if (settings.model === 'gpt-5') {
        requestBody.max_completion_tokens = 20000; // GPT-5 supports higher limits
      } else if (settings.model === 'gpt-4o' || settings.model === 'gpt-4o-mini') {
        requestBody.max_tokens = 16000; // GPT-4o max: 16384, use 16000 for safety
      } else if (settings.model === 'gpt-4' || settings.model === 'gpt-4-turbo') {
        requestBody.max_tokens = 4000; // GPT-4 max: 4096, use 4000 for safety
      } else {
        requestBody.max_tokens = 4000; // GPT-3.5-turbo and others: 4096 max
      }

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('OpenAI response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('OpenAI API error:', errorData);
        throw new Error(errorData.error?.message || 'API request failed');
      }

      let accumulatedContent = '';
      let isGeneratingCode = false; // Track if we've entered the code block

      if (useStreaming) {
        // Process streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error('Response body reader not available');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                console.log('Stream completed');
                break;
              }

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices[0]?.delta?.content;

                if (delta) {
                  accumulatedContent += delta;

                  // Check if we've hit the code block marker
                  if (accumulatedContent.includes('```json')) {
                    isGeneratingCode = true;
                  }

                  // Extract summary (everything before ```json)
                  const summaryEndIndex = accumulatedContent.indexOf('```json');
                  const displayContent = summaryEndIndex !== -1
                    ? accumulatedContent.substring(0, summaryEndIndex).trim()
                    : accumulatedContent;

                  // Update the assistant message in real-time with ONLY summary text
                  const updatedAssistantMessage: Message = {
                    ...assistantMessage,
                    content: accumulatedContent, // Store full content
                    displayContent: displayContent, // But only display summary
                    isGenerating: isGeneratingCode, // Flag for UI to show progress indicator
                  };

                  const updatedMessages = messagesWithAssistant.map(m =>
                    m.id === assistantMessageId ? updatedAssistantMessage : m
                  );

                  const updatedChat = {
                    ...chatWithAssistant,
                    messages: updatedMessages,
                    updatedAt: Date.now(),
                  };

                  setCurrentChat(updatedChat);

                  // Update chats array
                  const updatedChatsArray = chats.map((c) =>
                    c.id === currentChat.id ? updatedChat : c
                  );
                  setChats(updatedChatsArray);
                }
              } catch (e) {
                console.error('Error parsing stream chunk:', e);
              }
            }
          }
        }

        console.log('Final accumulated content length:', accumulatedContent.length);
      } else {
        // Non-streaming response (for GPT-5)
        // Show progress stages with dynamic, fun messages like Claude Code
        const funnyMessages = [
          'Thinking', 'Pondering', 'Analyzing', 'Brainstorming', 'Contemplating',
          'Ideating', 'Architecting', 'Designing', 'Blueprinting', 'Sketching',
          'Crafting', 'Building', 'Constructing', 'Assembling', 'Weaving',
          'Coding', 'Typing', 'Scripting', 'Programming', 'Compiling',
          'Generating', 'Creating', 'Manifesting', 'Conjuring', 'Materializing',
          'Polishing', 'Refining', 'Optimizing', 'Perfecting', 'Fine-tuning',
          'Seasoning', 'Marinating', 'Simmering', 'Baking', 'Sautéing',
          'Mixing', 'Blending', 'Whisking', 'Kneading', 'Folding',
          'Emulsifying', 'Caramelizing', 'Glazing', 'Garnishing', 'Plating'
        ];

        const progressStages = [
          { delay: 0, messageBase: funnyMessages[Math.floor(Math.random() * 5)], percent: 10 },
          { delay: 8000, messageBase: funnyMessages[5 + Math.floor(Math.random() * 5)], percent: 20 },
          { delay: 16000, messageBase: funnyMessages[10 + Math.floor(Math.random() * 5)], percent: 30 },
          { delay: 24000, messageBase: funnyMessages[15 + Math.floor(Math.random() * 5)], percent: 40 },
          { delay: 32000, messageBase: funnyMessages[20 + Math.floor(Math.random() * 5)], percent: 50 },
          { delay: 40000, messageBase: funnyMessages[25 + Math.floor(Math.random() * 5)], percent: 60 },
          { delay: 48000, messageBase: funnyMessages[30 + Math.floor(Math.random() * 5)], percent: 70 },
          { delay: 56000, messageBase: funnyMessages[35 + Math.floor(Math.random() * 5)], percent: 80 },
          { delay: 64000, messageBase: funnyMessages[40 + Math.floor(Math.random() * 5)], percent: 90 },
        ];

        // Helper function to update progress stage with dynamic dots
        let dotCount = 0;
        const maxDots = 3;
        const updateProgressStage = (stage: { messageBase: string }, index: number) => {
          const dots = '.'.repeat((dotCount % (maxDots + 1)));
          dotCount++;

          const updatedAssistantMessage: Message = {
            ...assistantMessage,
            content: '',
            displayContent: `${stage.messageBase}${dots}`,
            isGenerating: true,
            progressStage: index,
          };

          const updatedMessages = messagesWithAssistant.map(m =>
            m.id === assistantMessageId ? updatedAssistantMessage : m
          );

          const updatedChat = {
            ...chatWithAssistant,
            messages: updatedMessages,
            updatedAt: Date.now(),
          };

          setCurrentChat(updatedChat);

          // Also update chats array for persistence
          const updatedChatsArray = chats.map((c) =>
            c.id === currentChat.id ? updatedChat : c
          );
          setChats(updatedChatsArray);
        };

        // Show first stage immediately
        let currentStageIndex = 0;
        updateProgressStage(progressStages[0], 0);

        // Animate dots every 400ms for current stage
        const dotAnimationInterval = window.setInterval(() => {
          updateProgressStage(progressStages[currentStageIndex], currentStageIndex);
        }, 400);

        // Start progress stage updates for remaining stages
        const progressIntervals: number[] = [dotAnimationInterval];
        progressStages.slice(1).forEach((stage, index) => {
          const timeoutId = window.setTimeout(() => {
            currentStageIndex = index + 1;
            updateProgressStage(stage, index + 1);
          }, stage.delay);

          progressIntervals.push(timeoutId);
        });

        // Wait for API response
        const data = await response.json();
        console.log('OpenAI response:', data);

        // Check if response was truncated due to token limit
        const finishReason = data.choices[0].finish_reason;
        if (finishReason === 'length') {
          console.warn('⚠️ Response truncated due to token limit. Consider increasing max_completion_tokens.');
        }

        accumulatedContent = data.choices[0].message.content || '';

        if (!accumulatedContent) {
          throw new Error('Empty response from OpenAI API. The model may have hit token limits or encountered an error.');
        }

        // Clear all pending progress intervals and the dot animation interval
        progressIntervals.forEach(id => {
          clearTimeout(id);
          clearInterval(id); // Also clear in case it's the dot animation interval
        });

        // Extract summary for non-streaming too
        const summaryEndIndex = accumulatedContent.indexOf('```json');
        const displayContent = summaryEndIndex !== -1
          ? accumulatedContent.substring(0, summaryEndIndex).trim()
          : accumulatedContent;

        // Update the assistant message with complete content
        const updatedAssistantMessage: Message = {
          ...assistantMessage,
          content: accumulatedContent,
          displayContent: displayContent,
          isGenerating: summaryEndIndex !== -1, // Show progress indicator while we parse
        };

        const updatedMessages = messagesWithAssistant.map(m =>
          m.id === assistantMessageId ? updatedAssistantMessage : m
        );

        const updatedChat = {
          ...chatWithAssistant,
          messages: updatedMessages,
          updatedAt: Date.now(),
        };

        setCurrentChat(updatedChat);
      }

      // Save final state to storage (clear isGenerating flag)
      const summaryEndIndex = accumulatedContent.indexOf('```json');
      const finalDisplayContent = summaryEndIndex !== -1
        ? accumulatedContent.substring(0, summaryEndIndex).trim()
        : accumulatedContent;

      const finalMessages = messagesWithAssistant.map(m =>
        m.id === assistantMessageId
          ? { ...m, content: accumulatedContent, displayContent: finalDisplayContent, isGenerating: false }
          : m
      );
      const finalChat = { ...chatWithAssistant, messages: finalMessages };
      const finalChats = chats.map((c) => (c.id === currentChat.id ? finalChat : c));
      setChats(finalChats);
      chrome.storage.local.set({ chats: finalChats });

      // Try to parse and extract extension code
      try {
        const jsonMatch = accumulatedContent.match(/```json\n([\s\S]*?)\n```/) ||
          accumulatedContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extensionData = JSON.parse(jsonMatch[1] || jsonMatch[0]);

          // Validate JavaScript syntax first
          console.log('Validating JavaScript syntax...');
          const syntaxResult = validateExtensionJavaScript(extensionData.files || {});

          if (!syntaxResult.valid) {
            console.error('❌ JavaScript syntax errors found');
            const syntaxErrorMessage = formatSyntaxErrors(syntaxResult.errors);

            console.log('Auto-fixing syntax errors by asking AI to regenerate...');

            const fixPrompt = `The extension code you generated has JavaScript syntax errors:\n\n${syntaxErrorMessage}\n\nPlease fix these syntax errors and provide the corrected extension code. Make sure to:\n1. Fix all the syntax errors listed above\n2. Validate that all JavaScript code is syntactically correct\n3. Return the complete, valid extension in the same JSON format as before`;

            // Automatically send fix request
            const fixRequestMessage: Message = {
              id: (Date.now() + 2).toString(),
              role: 'user',
              content: fixPrompt,
              timestamp: Date.now(),
            };

            const messagesWithFix = [...finalMessages, fixRequestMessage];
            const chatWithFix = { ...finalChat, messages: messagesWithFix };
            setCurrentChat(chatWithFix);
            const chatsWithFix = chats.map((c) =>
              c.id === currentChat.id ? chatWithFix : c
            );
            setChats(chatsWithFix);
            chrome.storage.local.set({ chats: chatsWithFix });

            // Recursively call sendMessage to get AI to fix it
            setTimeout(() => {
              sendMessage(fixPrompt);
            }, 100);

            return; // Stop processing, wait for AI to fix
          }

          console.log('✅ JavaScript syntax validation passed!');

          // Validate extension structure
          console.log('Validating extension structure...');
          const validationResult = validateExtension(extensionData);

          // Log validation results
          if (validationResult.errors.length > 0) {
            console.error('Extension validation errors:', validationResult.errors);
          }
          if (validationResult.warnings.length > 0) {
            console.warn('Extension validation warnings:', validationResult.warnings);
          }

          // Only save extension if validation passes (no errors)
          if (validationResult.isValid) {
            console.log('✅ Extension validation passed!');
            setGeneratedExtension(extensionData);

            // Use the manifest name as the chat title
            const chatTitle = extensionData.manifest?.name || currentChat.title;
            console.log('Updated chat title from manifest:', chatTitle);

            // Save extension to the current chat with updated title
            const chatWithExtension = { ...finalChat, generatedExtension: extensionData, title: chatTitle };
            setCurrentChat(chatWithExtension);
            const chatsWithExtension = chats.map((c) =>
              c.id === currentChat.id ? chatWithExtension : c
            );
            setChats(chatsWithExtension);
            chrome.storage.local.set({ chats: chatsWithExtension });

            // If there are warnings, add them to chat (optional)
            if (validationResult.warnings.length > 0) {
              console.log('Extension has warnings:', formatValidationErrors(validationResult));
            }
          } else {
            // Validation failed - automatically ask AI to fix the issues
            console.error('❌ Extension validation failed');
            const validationErrorMessage = formatValidationErrors(validationResult);

            console.log('Auto-fixing validation errors by asking AI to regenerate...');

            const fixPrompt = `The extension you generated has validation errors:\n\n${validationErrorMessage}\n\nPlease fix these validation errors and provide the corrected extension code. Make sure to:\n1. Follow the exact file structure required (manifest.json + 4 files)\n2. Fix all the validation errors listed above\n3. Return the complete, valid JSON in the same format as before`;

            // Automatically send fix request
            const fixRequestMessage: Message = {
              id: (Date.now() + 2).toString(),
              role: 'user',
              content: fixPrompt,
              timestamp: Date.now(),
            };

            const messagesWithFix = [...finalMessages, fixRequestMessage];
            const chatWithFix = { ...finalChat, messages: messagesWithFix };
            setCurrentChat(chatWithFix);
            const chatsWithFix = chats.map((c) =>
              c.id === currentChat.id ? chatWithFix : c
            );
            setChats(chatsWithFix);
            chrome.storage.local.set({ chats: chatsWithFix });

            // Recursively call sendMessage to get AI to fix it
            setTimeout(() => {
              sendMessage(fixPrompt);
            }, 100);
          }
        }
      } catch (e) {
        console.error('Failed to parse extension data:', e);

        // Instead of showing error to user, automatically ask AI to fix the JSON
        console.log('Auto-fixing malformed JSON by asking AI to regenerate...');

        const errorDetails = e instanceof Error ? e.message : 'Invalid JSON format';
        const fixPrompt = `The JSON you provided has a syntax error: ${errorDetails}\n\nPlease fix the JSON and provide the corrected extension code. Make sure to:\n1. Fix the JSON syntax error\n2. Ensure all strings are properly quoted\n3. Ensure all commas are in the right places\n4. Return the complete, valid JSON in the same format as before`;

        // Automatically send fix request (no user interaction needed)
        const fixRequestMessage: Message = {
          id: (Date.now() + 3).toString(),
          role: 'user',
          content: fixPrompt,
          timestamp: Date.now(),
        };

        const messagesWithFix = [...finalMessages, fixRequestMessage];
        const chatWithFix = { ...finalChat, messages: messagesWithFix };
        setCurrentChat(chatWithFix);
        const chatsWithFix = chats.map((c) =>
          c.id === currentChat.id ? chatWithFix : c
        );
        setChats(chatsWithFix);
        chrome.storage.local.set({ chats: chatsWithFix });

        // Recursively call sendMessage to get AI to fix it
        // Wait a bit to ensure state is updated
        setTimeout(() => {
          sendMessage(fixPrompt);
        }, 100);
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);

      // Add error message to chat
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error instanceof Error ? error.message : 'Failed to connect to OpenAI API. Please check your API key and try again.'}`,
        timestamp: Date.now(),
      };

      const errorMessages = [...updatedMessages, errorMessage];
      const errorChat = { ...updatedChat, messages: errorMessages };
      setCurrentChat(errorChat);
      const errorChats = chats.map((c) => (c.id === currentChat.id ? errorChat : c));
      setChats(errorChats);
      chrome.storage.local.set({ chats: errorChats });
    }
  };

  const updateSettings = (newSettings: Partial<Settings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    chrome.storage.local.set({ settings: updated });
  };

  return (
    <ChatContext.Provider
      value={{
        currentChat,
        chats,
        settings,
        generatedExtension,
        createNewChat,
        selectChat,
        deleteChat,
        sendMessage,
        updateSettings,
        setGeneratedExtension,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
};
