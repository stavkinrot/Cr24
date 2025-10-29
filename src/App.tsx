import React, { useState } from 'react';
import Header from './components/Header';
import ChatPanel from './components/ChatPanel';
import PreviewPanel from './components/PreviewPanel';
import Sidebar from './components/Sidebar';
import SettingsModal from './components/SettingsModal';
import { ThemeProvider } from './context/ThemeContext';
import { ChatProvider } from './context/ChatContext';
import './styles/App.css';

const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  return (
    <ThemeProvider>
      <ChatProvider>
        <div className="app">
          <Header
            onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
          <div className="app-content">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            <ChatPanel />
            <PreviewPanel />
          </div>
          {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
        </div>
      </ChatProvider>
    </ThemeProvider>
  );
};

export default App;
