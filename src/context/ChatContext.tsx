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
    model: 'gpt-4o',
    temperature: 0.7,
  });
  const [generatedExtension, setGeneratedExtension] = useState<GeneratedExtension | null>(null);

  useEffect(() => {
    // Load data from chrome storage
    chrome.storage.local.get(['chats', 'currentChatId', 'settings'], (result) => {
      if (result.chats) {
        setChats(result.chats);
        if (result.currentChatId) {
          const chat = result.chats.find((c: Chat) => c.id === result.currentChatId);
          if (chat) {
            setCurrentChat(chat);
            // Load the extension from the chat if it exists
            if (chat.generatedExtension) {
              setGeneratedExtension(chat.generatedExtension);
            }
          }
        }
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

    // Call OpenAI API
    try {
      console.log('Calling OpenAI API with model:', settings.model);
      console.log('API Key starts with:', settings.apiKey.substring(0, 10) + '...');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 minute timeout

      // GPT-5 only supports temperature of 1
      const effectiveTemperature = settings.model === 'gpt-5' ? 1 : settings.temperature;

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
              content: `You are an expert Chrome extension developer. Generate complete, working Chrome extension code based on user requirements.

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
- Use manifest version 3`,
            },
            ...updatedMessages.map((m) => ({ role: m.role, content: m.content })),
          ],
          temperature: effectiveTemperature,
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

      const data = await response.json();
      console.log('OpenAI response:', data);

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.choices[0].message.content,
        timestamp: Date.now(),
      };

      const finalMessages = [...updatedMessages, assistantMessage];
      const finalChat = { ...updatedChat, messages: finalMessages };
      setCurrentChat(finalChat);
      const finalChats = chats.map((c) => (c.id === currentChat.id ? finalChat : c));
      setChats(finalChats);
      chrome.storage.local.set({ chats: finalChats });

      // Try to parse and extract extension code
      try {
        const jsonMatch = assistantMessage.content.match(/```json\n([\s\S]*?)\n```/) ||
          assistantMessage.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const extensionData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
          setGeneratedExtension(extensionData);

          // Save extension to the current chat
          const chatWithExtension = { ...finalChat, generatedExtension: extensionData };
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
