import React, { createContext, useContext, useState, useEffect } from 'react';
import { Chat, Message, Settings, GeneratedExtension } from '../types';

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

      // GPT-5 requires organization verification for streaming, so disable it
      const useStreaming = settings.model !== 'gpt-5';

      console.log('Calling OpenAI API with model:', settings.model, useStreaming ? '(streaming enabled)' : '(streaming disabled)');
      console.log('API Key starts with:', settings.apiKey.substring(0, 10) + '...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      const systemPrompt = `You are an expert Chrome extension developer. Generate complete, working Chrome extension code based on user requirements.

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
    // other manifest fields
  },
  "files": {
    "popup.html": "complete HTML code here",
    "popup.js": "complete JavaScript code here",
    "popup.css": "complete CSS code here",
    "content.js": "complete content script code here (if needed)",
    // other files as needed
  },
  "type": "popup"
}
\`\`\`

Make sure:
- The summary is conversational and explains what you built
- All code is production-ready and follows Chrome extension best practices
- Include all necessary files (HTML, CSS, JS)
- Use manifest version 3`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
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
        }),
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
        // Show progress stages to provide feedback during long wait (up to 6 minutes)
        const progressStages = [
          { delay: 0, message: 'Analyzing your requirements...' },
          { delay: 8000, message: 'Designing extension architecture...' },
          { delay: 20000, message: 'Planning file structure...' },
          { delay: 35000, message: 'Generating manifest.json...' },
          { delay: 55000, message: 'Creating popup interface...' },
          { delay: 80000, message: 'Writing HTML markup...' },
          { delay: 110000, message: 'Styling with CSS...' },
          { delay: 145000, message: 'Implementing core JavaScript logic...' },
          { delay: 185000, message: 'Adding Chrome API integration...' },
          { delay: 230000, message: 'Implementing event handlers...' },
          { delay: 275000, message: 'Optimizing and testing code...' },
          { delay: 320000, message: 'Finalizing extension files...' },
          { delay: 350000, message: 'Almost ready, just a moment longer...' },
        ];

        // Helper function to update progress stage
        const updateProgressStage = (stage: { message: string }, index: number) => {
          const updatedAssistantMessage: Message = {
            ...assistantMessage,
            content: '',
            displayContent: stage.message,
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
        updateProgressStage(progressStages[0], 0);

        // Start progress stage updates for remaining stages
        const progressIntervals: number[] = [];
        progressStages.slice(1).forEach((stage, index) => {
          const timeoutId = window.setTimeout(() => {
            updateProgressStage(stage, index + 1);
          }, stage.delay);

          progressIntervals.push(timeoutId);
        });

        // Wait for API response
        const data = await response.json();
        console.log('OpenAI response:', data);
        accumulatedContent = data.choices[0].message.content;

        // Clear all pending progress intervals
        progressIntervals.forEach(id => clearTimeout(id));

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
        }
      } catch (e) {
        console.error('Failed to parse extension data:', e);
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
