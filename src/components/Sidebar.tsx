import React from 'react';
import { useChat } from '../context/ChatContext';
import '../styles/Sidebar.css';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { chats, currentChat, selectChat, deleteChat } = useChat();

  return (
    <>
      {isOpen && <div className="sidebar-overlay" onClick={onClose} />}
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>Chats</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>
        <div className="sidebar-content">
          {chats.length === 0 ? (
            <div className="sidebar-empty">
              <p>No messages</p>
            </div>
          ) : (
            chats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item ${currentChat?.id === chat.id ? 'active' : ''}`}
                onClick={() => {
                  selectChat(chat.id);
                  onClose();
                }}
              >
                <div className="chat-item-content">
                  <div className="chat-item-title">{chat.title}</div>
                  <div className="chat-item-preview">
                    {chat.messages.length > 0
                      ? chat.messages[chat.messages.length - 1].content.substring(0, 50) + '...'
                      : 'No messages'}
                  </div>
                </div>
                <button
                  className="delete-button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chat.id);
                  }}
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

export default Sidebar;
