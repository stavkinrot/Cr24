import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../context/ChatContext';
import FileList from './FileList';
import '../styles/ChatPanel.css';

const ChatPanel: React.FC = () => {
  const { currentChat, sendMessage, generatedExtension } = useChat();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messageExtensions, setMessageExtensions] = useState<Map<string, any>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentChat?.messages]);

  // Track which messages have generated extensions
  useEffect(() => {
    if (generatedExtension && currentChat?.messages.length) {
      const lastMessage = currentChat.messages[currentChat.messages.length - 1];
      if (lastMessage.role === 'assistant') {
        setMessageExtensions(prev => new Map(prev).set(lastMessage.id, generatedExtension));
      }
    }
  }, [generatedExtension, currentChat?.messages]);

  const parseExtensionFromMessage = (content: string) => {
    try {
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.manifest && parsed.files) {
          return parsed;
        }
      }
    } catch (e) {
      // Not a valid extension
    }
    return null;
  };

  const getMessageSummary = (content: string) => {
    // Extract text before the JSON code block
    const jsonBlockIndex = content.indexOf('```json');
    if (jsonBlockIndex !== -1) {
      return content.substring(0, jsonBlockIndex).trim();
    }
    return content;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);
    try {
      await sendMessage(input);
      setInput('');
    } catch (error) {
      console.error('Error in handleSend:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-panel">
      <div className="messages-container">
        {currentChat?.messages.length === 0 && (
          <div className="empty-state">
            <h2>What would you like your extension to do?</h2>
            <p>Describe the Chrome extension you want to create, and I'll generate it for you.</p>
          </div>
        )}
        {currentChat?.messages.map((message) => {
          const extension = messageExtensions.get(message.id) || parseExtensionFromMessage(message.content);
          const displayText = message.role === 'assistant' && extension
            ? getMessageSummary(message.content)
            : message.content;

          return (
            <div key={message.id} className={`message message-${message.role}`}>
              <div className="message-content">
                <div className="message-text">{displayText}</div>
                {message.role === 'assistant' && extension && (
                  <FileList extension={extension} />
                )}
                <div className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="message message-assistant">
            <div className="message-content">
              <div className="message-text loading">Generating extension...</div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="input-container">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="What would you like your extension to do?"
          disabled={isLoading}
        />
        <button
          className="send-button"
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
        >
          ➤
        </button>
      </div>
    </div>
  );
};

export default ChatPanel;
