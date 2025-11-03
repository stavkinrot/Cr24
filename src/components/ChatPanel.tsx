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
    setInput(''); // Clear input immediately for better UX
    try {
      await sendMessage(input);
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

          // Use displayContent if available (summary only), otherwise use full content
          const displayText = message.displayContent || (
            message.role === 'assistant' && extension
              ? getMessageSummary(message.content)
              : message.content
          );

          // Check if we're showing progress stages (GPT-5 non-streaming)
          // Use message.isGenerating instead of isLoading for persistence across chat switches
          const isShowingProgressStages = message.progressStage !== undefined && message.isGenerating;

          // Show progress indicator when generating code (after summary is shown)
          const showProgressIndicator = message.isGenerating && !isShowingProgressStages;

          // Show initial streaming indicator for empty assistant messages (no progress stages yet)
          const isInitialStreaming = message.role === 'assistant' &&
            message.content === '' &&
            !message.displayContent &&
            isLoading; // Only use isLoading for the very first moment

          return (
            <div key={message.id} className={`message message-${message.role}`}>
              <div className="message-content">
                {isShowingProgressStages ? (
                  <div className="progress-stage">
                    <div className="progress-stage-indicator">
                      <span className="progress-spinner">⏳</span>
                      <span className="progress-stage-text">{displayText}</span>
                    </div>
                  </div>
                ) : isInitialStreaming ? (
                  <div className="message-text streaming">
                    <span className="streaming-indicator">●</span> Thinking...
                  </div>
                ) : (
                  <>
                    <div className="message-text">{displayText}</div>
                    {showProgressIndicator && (
                      <div className="progress-indicator">
                        <span className="progress-spinner">⏳</span> Generating extension files...
                      </div>
                    )}
                    {message.role === 'assistant' && extension && !showProgressIndicator && (
                      <FileList extension={extension} chatTitle={currentChat?.title} />
                    )}
                  </>
                )}
                <div className="message-time">
                  {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}
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
