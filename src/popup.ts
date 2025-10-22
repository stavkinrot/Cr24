// popup.ts — Context-aware Chat UI for CRX Generator
import { generateZipFromFiles } from './generator/index';

// Import preview runner with error handling
let createPreviewRunner: any = null;
let PreviewRunner: any = null;

async function loadPreviewModule() {
  try {
    console.log('Attempting to load preview module...');
    const module = await import('./preview/preview-runner.js');
    createPreviewRunner = module.createPreviewRunner;
    console.log('Preview module loaded successfully:', !!createPreviewRunner);
    
    return true;
  } catch (error) {
    console.error('Failed to load preview module:', error);
    
    // Add visual error indicator
    const indicator = document.createElement('div');
    indicator.textContent = 'Preview Module Failed ✗';
    indicator.style.position = 'fixed';
    indicator.style.top = '10px';
    indicator.style.left = '10px';
    indicator.style.background = 'red';
    indicator.style.color = 'white';
    indicator.style.padding = '5px';
    indicator.style.zIndex = '10000';
    document.body.appendChild(indicator);
    
    return false;
  }
}

type Role = 'user' | 'assistant';
type Theme = 'light' | 'dark';

// New types for the unified API
type AIFile = { path: string; content: string };
type GenerateRequest = {
  threadId: string;
  userMessage: string;
  previousFiles?: AIFile[]; // present only when editing
};
type GenerateResponse = {
  files: AIFile[];   // full bundle if new; changed subset if edit
  summary?: string;  // short changelog
};

type FileEntry = { path: string; content: string; included?: boolean };
type AIPlan = {
  planVersion: number;
  summary: string;
  features: Record<string, boolean>;
  files: { path: string; purpose: string }[];
  risks?: string[];
} | null;

const API_BASE = 'http://localhost:3000'; // your dev proxy

// Chat management types
interface ChatMetadata {
  id: string;
  title: string;
  lastMessage?: string;
  createdAt: number;
  lastModified: number;
}

interface ChatData extends ChatMetadata {
  messages: Msg[];
  files: FileEntry[];
}

/* ---------- tiny DOM helpers ---------- */
const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T;
const on = (el: Element | Document, ev: string, fn: any) =>
  el.addEventListener(ev, fn);

/* ---------- theme ---------- */
function getStoredTheme(): Theme | null {
  const v = localStorage.getItem('theme');
  return v === 'light' || v === 'dark' ? (v as Theme) : null;
}
function getPreferredTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function updateThemeIcon(theme: Theme) {
  const themeToggle = $('#themeToggle') as HTMLButtonElement;
  const svg = themeToggle.querySelector('svg path');
  if (svg) {
    if (theme === 'light') {
      // Show moon icon in light mode
      svg.setAttribute('d', 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c4.97 0 9-4.03 9-9 0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z');
    } else {
      // Show sun icon in dark mode
      svg.setAttribute('d', 'M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37c-.39-.39-1.03-.39-1.41 0-.39.39-.39 1.03 0 1.41l1.06 1.06c.39.39 1.03.39 1.41 0 .39-.39.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41-.39-.39-1.03-.39-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z');
    }
  }
}

/* ---------- chat state ---------- */
interface Msg {
  id: string;
  role: Role;
  html: string;              // pre-rendered HTML for content
  attachments?: {
    plan?: AIPlan;
    files?: FileEntry[];
  };
  actions?: {
    simulate?: boolean;
    generate?: boolean;
  };
}

// Thread and bundle state
let currentChatId: string;
let allChats: Map<string, ChatData> = new Map();
let messages: Msg[] = [];
let currentFiles: FileEntry[] = [];

let model: string = 'auto';
let temperature = 0.4;

// Preview runner state
let previewRunner: any = null;


/* ---------- IndexedDB for bundle persistence ---------- */
const DB_NAME = 'cr24_bundles';
const DB_VERSION = 2;
const STORE_NAME = 'bundles';
const CHAT_STORE_NAME = 'chats';

interface BundleData {
  threadId: string;
  files: AIFile[];
  lastModified: number;
}

interface ChatStorageData {
  chatId: string;
  metadata: ChatMetadata;
  messages: Msg[];
  files: FileEntry[];
}

let db: IDBDatabase | null = null;

async function initDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve();
    };
    
    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'threadId' });
        store.createIndex('lastModified', 'lastModified', { unique: false });
      }
      if (!database.objectStoreNames.contains(CHAT_STORE_NAME)) {
        const chatStore = database.createObjectStore(CHAT_STORE_NAME, { keyPath: 'chatId' });
        chatStore.createIndex('lastModified', 'metadata.lastModified', { unique: false });
      }
    };
  });
}

async function saveBundle(threadId: string, files: AIFile[]): Promise<void> {
  if (!db) return;
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    
    const bundleData: BundleData = {
      threadId,
      files,
      lastModified: Date.now()
    };
    
    const request = store.put(bundleData);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function loadBundle(threadId: string): Promise<AIFile[] | null> {
  if (!db) return null;
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    
    const request = store.get(threadId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as BundleData | undefined;
      resolve(result ? result.files : null);
    };
  });
}

/* ---------- preview management ---------- */
async function updatePreview(): Promise<void> {
  console.log('updatePreview called, previewRunner:', !!previewRunner, 'currentFiles:', currentFiles.length);
  
  // Add visual debugging
  const previewContainer = $('#previewContainer');
  if (previewContainer) {
    previewContainer.style.border = '2px solid red';
    previewContainer.style.backgroundColor = '#ff000020';
  }
  
  if (!previewRunner) {
    console.error('Preview runner not available!');
    return;
  }
  
  // Update chat indicator for current chat
  const currentChat = allChats.get(currentChatId);
  if (currentChat) {
    updatePreviewChatIndicator(currentChat);
  }
  
  if (!currentFiles.length) {
    console.log('No files to preview, showing placeholder');
    // Show placeholder when no files
    await previewRunner.updateBundle([]);
    return;
  }
  
  const aiFiles = currentFiles
    .filter(f => f.included !== false)
    .map(f => ({ path: f.path, content: f.content }));
  
  console.log('Filtered aiFiles for preview:', aiFiles.length, aiFiles.map(f => f.path));
  console.log('Calling previewRunner.updateBundle with files:', aiFiles);
  await previewRunner.updateBundle(aiFiles);
}

async function updatePreviewForChat(chatData: ChatData): Promise<void> {
  console.log('updatePreviewForChat called for chat:', chatData.id, 'files:', chatData.files.length);
  if (!previewRunner) return;
  
  // Update the chat indicator
  updatePreviewChatIndicator(chatData);
  
  if (!chatData.files || chatData.files.length === 0) {
    // Show placeholder when no files for this chat
    await previewRunner.updateBundle([]);
    return;
  }
  
  const aiFiles = chatData.files
    .filter(f => f.included !== false)
    .map(f => ({ path: f.path, content: f.content }));
  
  console.log('Filtered aiFiles for chat preview:', aiFiles.length, aiFiles.map(f => f.path));
  await previewRunner.updateBundle(aiFiles);
}

function updatePreviewChatIndicator(chatData: ChatData): void {
  const indicator = $('#previewChatIndicator');
  if (!indicator) return;
  
  const chatTitle = chatData.title && chatData.title !== 'New Chat'
    ? chatData.title
    : `Chat ${chatData.id.substring(0, 8)}`;
  
  const fileCount = chatData.files?.length || 0;
  
  if (fileCount > 0) {
    indicator.textContent = `${chatTitle} (${fileCount} files)`;
    indicator.style.display = 'inline-block';
    indicator.style.opacity = '1';
  } else {
    indicator.textContent = `${chatTitle} (no extension)`;
    indicator.style.display = 'inline-block';
    indicator.style.opacity = '0.6';
  }
}

async function initializePreview(): Promise<void> {
  console.log('Initializing preview...');
  const previewContainer = $('#previewContainer');
  console.log('Preview container found:', !!previewContainer);
  if (!previewContainer) {
    console.warn('Preview container not found');
    return;
  }
  
  // Add visual debugging to container
  previewContainer.style.border = '2px solid blue';
  previewContainer.style.backgroundColor = '#0000ff20';
  
  // Load preview module
  const moduleLoaded = await loadPreviewModule();
  if (!moduleLoaded || !createPreviewRunner) {
    console.error('Preview module failed to load');
    
    // Add error message to the preview container
    previewContainer.innerHTML = `
      <div style="padding: 20px; text-align: center; color: red;">
        <h3>Preview System Error</h3>
        <p>Failed to load preview module. Check console for details.</p>
        <button id="reloadButton">Reload Extension</button>
      </div>
    `;
    
    // Add event listener for reload button
    const reloadButton = previewContainer.querySelector('#reloadButton');
    if (reloadButton) {
      reloadButton.addEventListener('click', () => location.reload());
    }
    return;
  }
  
  console.log('Creating preview runner...');
  previewRunner = createPreviewRunner({
    container: previewContainer,
    onError: (error: Error) => {
      console.error('Preview error:', error);
      pushMessage({
        role: 'assistant',
        html: `<div class="error">Preview error: ${escapeHtml(error.message)}</div>`
      });
    },
    onBackgroundMessage: (message: any) => {
      console.log('Background message:', message);
      // Could show background script activity in UI
    }
  });
  console.log('Preview runner created:', !!previewRunner);
  
  
  // Test the preview immediately
  console.log('Testing preview with current files...');
  updatePreview();
  
}

function cleanupPreview(): void {
  if (previewRunner) {
    previewRunner.cleanup();
    previewRunner = null;
  }
}

/* ---------- file operations ---------- */
function normalizePath(p: string): string {
  return p.replace(/^\.?\/*/, '');
}

function mergeChangedFiles(prev: AIFile[], changed: AIFile[]): AIFile[] {
  const map = new Map(prev.map(f => [normalizePath(f.path), f]));
  for (const c of changed) {
    map.set(normalizePath(c.path), c);
  }
  return Array.from(map.values());
}

/**
 * Filters out icon references from manifest.json to prevent binary file generation
 */
function filterIconsFromManifest(files: AIFile[]): AIFile[] {
  return files.map(file => {
    if (normalizePath(file.path) === 'manifest.json') {
      try {
        const manifest = JSON.parse(file.content);
        
        // Remove icons from manifest to prevent binary generation
        if (manifest.icons) {
          console.log('Removing icons from manifest to prevent binary file generation');
          delete manifest.icons;
        }
        
        // Remove icon from action if present
        if (manifest.action && manifest.action.default_icon) {
          console.log('Removing action icon from manifest');
          delete manifest.action.default_icon;
        }
        
        // Remove icon from browser_action if present (MV2 compatibility)
        if (manifest.browser_action && manifest.browser_action.default_icon) {
          console.log('Removing browser_action icon from manifest');
          delete manifest.browser_action.default_icon;
        }
        
        // Remove icon from page_action if present (MV2 compatibility)
        if (manifest.page_action && manifest.page_action.default_icon) {
          console.log('Removing page_action icon from manifest');
          delete manifest.page_action.default_icon;
        }
        
        return {
          ...file,
          content: JSON.stringify(manifest, null, 2)
        };
      } catch (error) {
        console.warn('Failed to parse manifest.json for icon filtering:', error);
        return file;
      }
    }
    return file;
  });
}

/* ---------- chat management ---------- */
async function saveChat(chatData: ChatData): Promise<void> {
  if (!db) return;
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([CHAT_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHAT_STORE_NAME);
    
    const storageData: ChatStorageData = {
      chatId: chatData.id,
      metadata: {
        id: chatData.id,
        title: chatData.title,
        lastMessage: chatData.lastMessage,
        createdAt: chatData.createdAt,
        lastModified: chatData.lastModified
      },
      messages: chatData.messages,
      files: chatData.files
    };
    
    const request = store.put(storageData);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function loadChat(chatId: string): Promise<ChatData | null> {
  if (!db) return null;
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([CHAT_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CHAT_STORE_NAME);
    
    const request = store.get(chatId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const result = request.result as ChatStorageData | undefined;
      if (result) {
        const chatData: ChatData = {
          ...result.metadata,
          messages: result.messages,
          files: result.files
        };
        resolve(chatData);
      } else {
        resolve(null);
      }
    };
  });
}

async function loadAllChats(): Promise<ChatMetadata[]> {
  if (!db) return [];
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([CHAT_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CHAT_STORE_NAME);
    const index = store.index('lastModified');
    
    const request = index.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const results = request.result as ChatStorageData[];
      const chats = results
        .map(r => r.metadata)
        .sort((a, b) => b.lastModified - a.lastModified);
      resolve(chats);
    };
  });
}

async function deleteChat(chatId: string): Promise<void> {
  if (!db) return;
  
  return new Promise((resolve, reject) => {
    const transaction = db!.transaction([CHAT_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CHAT_STORE_NAME);
    
    const request = store.delete(chatId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

function createNewChat(): ChatData {
  const chatId = crypto.randomUUID();
  const now = Date.now();
  
  return {
    id: chatId,
    title: 'New Chat',
    createdAt: now,
    lastModified: now,
    messages: [],
    files: []
  };
}

function updateChatTitle(chatData: ChatData): void {
  const userMessages = chatData.messages.filter(m => m.role === 'user');
  if (userMessages.length > 0) {
    const firstMessage = userMessages[0].html.replace(/<[^>]*>/g, '').trim();
    chatData.title = firstMessage.length > 30
      ? firstMessage.substring(0, 30) + '...'
      : firstMessage;
  }
}

async function generateExtensionName(files: FileEntry[]): Promise<string | null> {
  try {
    // Find manifest.json to understand the extension
    const manifestFile = files.find(f => normalizePath(f.path) === 'manifest.json');
    if (!manifestFile) return null;
    
    const manifest = JSON.parse(manifestFile.content);
    const extensionName = manifest.name || 'Extension';
    const description = manifest.description || '';
    
    // Simple name extraction from manifest first
    if (extensionName && extensionName !== 'Extension' && extensionName.length < 30) {
      const cleanName = extensionName.replace(/extension|app|chrome/gi, '').trim();
      if (cleanName.length > 2) {
        return cleanName;
      }
    }
    
    // Fallback to description-based name
    if (description && description.length > 5) {
      const words = description.split(/\s+/).slice(0, 3);
      const name = words.join(' ').replace(/[^a-zA-Z0-9\s]/g, '').trim();
      if (name.length > 2 && name.length < 30) {
        return name;
      }
    }
    
    // Default based on file types
    const hasPopup = files.some(f => f.path.includes('popup'));
    const hasContent = files.some(f => f.path.includes('content'));
    const hasBackground = files.some(f => f.path.includes('background') || f.path.includes('service-worker'));
    
    if (hasPopup && hasBackground) return 'Popup Extension';
    if (hasContent) return 'Content Extension';
    if (hasBackground) return 'Background Extension';
    
    return 'Custom Extension';
  } catch (error) {
    console.warn('Failed to generate extension name:', error);
    return 'Extension';
  }
}

async function updateChatTitleWithExtension(chatData: ChatData): Promise<void> {
  try {
    // Try to generate AI name from extension files
    if (chatData.files && chatData.files.length > 0) {
      const aiGeneratedName = await generateExtensionName(chatData.files);
      if (aiGeneratedName && aiGeneratedName.length > 0) {
        chatData.title = aiGeneratedName;
        return;
      }
    }
  } catch (error) {
    console.warn('Extension name generation failed:', error);
  }
  
  // Fallback to user message based title
  updateChatTitle(chatData);
}

async function switchToChat(chatId: string): Promise<void> {
  // Save current chat if it exists
  if (currentChatId && allChats.has(currentChatId)) {
    const currentChat = allChats.get(currentChatId)!;
    currentChat.messages = messages;
    currentChat.files = currentFiles;
    currentChat.lastModified = Date.now();
    await saveChat(currentChat);
  }
  
  // Load new chat
  let chatData = await loadChat(chatId);
  if (!chatData) {
    chatData = createNewChat();
    chatData.id = chatId;
  }
  
  // Update current state
  currentChatId = chatId;
  messages = chatData.messages || [];
  currentFiles = chatData.files || [];
  allChats.set(chatId, chatData);
  
  // Save thread ID
  await saveThreadId(chatId);
  
  // Update UI
  renderMessages();
  renderChatList();
  
  // Update preview with new chat's files
  updatePreviewForChat(chatData);
}

function summarizeFiles(files: AIFile[]): string {
  if (!files.length) return 'No files in bundle.';
  
  const paths = files.map(f => f.path).join(', ');
  let summary = `Files: ${paths}\n\n`;
  
  // Include full manifest.json
  const manifest = files.find(f => normalizePath(f.path) === 'manifest.json');
  if (manifest) {
    summary += `manifest.json:\n${manifest.content}\n\n`;
  }
  
  // Include first ~8KB or ~200 lines of other files
  for (const file of files) {
    if (normalizePath(file.path) === 'manifest.json') continue;
    
    const lines = file.content.split('\n');
    const truncated = lines.length > 200 || file.content.length > 8192;
    const content = truncated 
      ? lines.slice(0, 200).join('\n') + '\n[TRUNCATED]'
      : file.content;
    
    summary += `${file.path}:\n${content}\n\n`;
  }
  
  return summary;
}

function removeDuplicateFiles(files: FileEntry[]): FileEntry[] {
  const seen = new Map<string, FileEntry>();
  for (const file of files) {
    const normalizedPath = normalizePath(file.path);
    if (!seen.has(normalizedPath)) {
      seen.set(normalizedPath, { ...file, path: normalizedPath });
    }
  }
  return Array.from(seen.values());
}

function sortFiles(files: FileEntry[]): FileEntry[] {
  return files.slice().sort((a, b) => {
    // manifest.json always first
    if (a.path === 'manifest.json') return -1;
    if (b.path === 'manifest.json') return 1;
    
    // Then by file type groups
    const aGroup = getFileGroup(a.path);
    const bGroup = getFileGroup(b.path);
    
    if (aGroup !== bGroup) {
      return aGroup - bGroup;
    }
    
    // Within same group, sort alphabetically
    return a.path.localeCompare(b.path);
  });
}

function getFileGroup(path: string): number {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  
  if (path === 'manifest.json') return 0;
  if (ext === 'html') return 1;
  if (ext === 'css') return 2;
  if (ext === 'ts' || ext === 'js') return 3;
  return 4; // everything else
}

/* ---------- chat list rendering ---------- */
function renderChatList(): void {
  const chatList = $('#chat-list')!;
  const chats = Array.from(allChats.values()).sort((a, b) => b.lastModified - a.lastModified);
  
  if (chats.length === 0) {
    chatList.innerHTML = '<div class="chat-item-placeholder">No chats yet. Create your first chat!</div>';
    return;
  }
  
  chatList.innerHTML = chats.map(chat => `
    <div class="chat-item ${chat.id === currentChatId ? 'active' : ''}" data-chat-id="${chat.id}">
      <div class="chat-item-info">
        <div class="chat-item-title">${escapeHtml(chat.title)}</div>
        <div class="chat-item-preview">${chat.lastMessage ? escapeHtml(chat.lastMessage.substring(0, 50)) + '...' : 'No messages'}</div>
      </div>
      <div class="chat-item-actions">
        <button class="chat-item-delete" data-chat-id="${chat.id}" data-action="delete-chat" title="Delete chat">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function toggleSidebar(show?: boolean): void {
  const sidebar = $('#chat-sidebar')!;
  const container = $('.app-container')!
  const isCurrentlyShown = !sidebar.hasAttribute('hidden');
  
  const shouldShow = show !== undefined ? show : !isCurrentlyShown;
  
  if (shouldShow) {
    sidebar.removeAttribute('hidden');
    container.classList.add('sidebar-open');
  } else {
    sidebar.setAttribute('hidden', '');
    container.classList.remove('sidebar-open');
  }
}

/* ---------- startup ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize IndexedDB
  try {
    await initDB();
  } catch (e) {
    console.error('Failed to initialize IndexedDB:', e);
  }
  
  // Initialize chat system
  const storedChatId = await getStoredThreadId();
  
  // Load all existing chats
  try {
    const chatMetadataList = await loadAllChats();
    for (const metadata of chatMetadataList) {
      const chatData = await loadChat(metadata.id);
      if (chatData) {
        allChats.set(metadata.id, chatData);
      }
    }
  } catch (e) {
    console.error('Failed to load chats:', e);
  }
  
  // Set current chat
  if (storedChatId && allChats.has(storedChatId)) {
    await switchToChat(storedChatId);
  } else {
    // Create first chat if none exist
    const newChat = createNewChat();
    currentChatId = newChat.id;
    allChats.set(newChat.id, newChat);
    messages = newChat.messages;
    currentFiles = newChat.files;
    await saveThreadId(currentChatId);
  }
  
  // Load existing bundle for backward compatibility
  try {
    const bundle = await loadBundle(currentChatId);
    if (bundle && bundle.length > 0 && currentFiles.length === 0) {
      currentFiles = bundle.map(f => ({ ...f, included: true }));
      
      // Update the current chat's files
      const currentChat = allChats.get(currentChatId);
      if (currentChat) {
        currentChat.files = currentFiles;
        
        // Generate AI name for restored bundle if chat still has default title
        if (currentChat.title === 'New Chat') {
          await updateChatTitleWithExtension(currentChat);
          await saveChat(currentChat);
          renderChatList();
        }
      }
      
      // Update preview with restored files for this specific chat
      updatePreview();
      
      // Show restored files
      pushMessage({
        role: 'assistant',
        html: `<div class="muted">Restored bundle for this conversation.</div>`,
        attachments: { files: currentFiles },
        actions: { simulate: true, generate: true },
      });
    }
  } catch (e) {
    console.error('Failed to load bundle:', e);
  }
  
  // Initial render
  renderChatList();
  
  // Initialize preview
  await initializePreview();
  
  // Update preview with current chat's files
  const currentChat = allChats.get(currentChatId);
  if (currentChat) {
    updatePreviewForChat(currentChat);
  }
  
  
  // Theme
  const themeToggle = $('#themeToggle') as HTMLButtonElement;
  const initial = getStoredTheme() || getPreferredTheme();
  applyTheme(initial);
  updateThemeIcon(initial);
  on(themeToggle, 'click', () => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  });

  // Persisted model/temperature
  chrome.storage?.local.get({ crxgen_model: 'auto', crxgen_temp: 0.4 }, (st) => {
    model = st.crxgen_model;
    temperature = Number(st.crxgen_temp) || 0.4;
    const sel = $('#ai-model') as HTMLSelectElement;
    const rng = $('#ai-temp') as HTMLInputElement;
    const lbl = $('#ai-temp-val') as HTMLSpanElement;
    if (sel) sel.value = model;
    if (rng) rng.value = String(temperature);
    if (lbl) lbl.textContent = String(temperature);
  });

  // Model popover
  const modelBtn = $('#modelButton')!;
  const popover = $('#model-popover')!;
  const modelSel = $('#ai-model') as HTMLSelectElement;
  const tempRange = $('#ai-temp') as HTMLInputElement;
  const tempVal = $('#ai-temp-val') as HTMLSpanElement;

  on(modelBtn, 'click', () => {
    const open = popover.hasAttribute('hidden') ? false : true;
    if (open) popover.setAttribute('hidden', '');
    else popover.removeAttribute('hidden');
    modelBtn.setAttribute('aria-expanded', String(!open));
  });
  on(document, 'click', (e: MouseEvent) => {
    if (!popover.contains(e.target as Node) && e.target !== modelBtn) {
      popover.setAttribute('hidden', '');
      modelBtn.setAttribute('aria-expanded', 'false');
    }
  });
  on(modelSel, 'change', () => {
    model = modelSel.value || 'auto';
    chrome.storage?.local.set({ crxgen_model: model });
  });
  on(tempRange, 'input', () => {
    temperature = Number(tempRange.value);
    tempVal.textContent = String(temperature);
    chrome.storage?.local.set({ crxgen_temp: temperature });
  });

  // New chat button
  const newChatBtn = $('#newChatButton')!;
  on(newChatBtn, 'click', async () => {
    const newChat = createNewChat();
    allChats.set(newChat.id, newChat);
    await switchToChat(newChat.id);
    toggleSidebar(false);
  });
  
  // Chat list button
  const chatListBtn = $('#chatListButton')!;
  on(chatListBtn, 'click', () => {
    toggleSidebar();
  });
  
  // Close sidebar button
  const closeSidebarBtn = $('#closeSidebar')!;
  on(closeSidebarBtn, 'click', () => {
    toggleSidebar(false);
  });
  
  // Refresh preview button
  const refreshPreviewBtn = $('#refreshPreview');
  if (refreshPreviewBtn) {
    on(refreshPreviewBtn, 'click', () => {
      if (previewRunner) {
        previewRunner.refreshPreview();
      }
    });
  }
  
  
  // Chat list delegation
  on($('#chat-list')!, 'click', async (e: Event) => {
    const target = e.target as HTMLElement;
    const chatItem = target.closest('.chat-item') as HTMLElement;
    const chatId = chatItem?.getAttribute('data-chat-id');
    
    if (target.matches('[data-action="delete-chat"]')) {
      e.stopPropagation();
      if (chatId && confirm('Delete this chat?')) {
        await deleteChat(chatId);
        allChats.delete(chatId);
        
        if (chatId === currentChatId) {
          // Switch to another chat or create new one
          const remainingChats = Array.from(allChats.values());
          if (remainingChats.length > 0) {
            await switchToChat(remainingChats[0].id);
          } else {
            const newChat = createNewChat();
            allChats.set(newChat.id, newChat);
            await switchToChat(newChat.id);
          }
        }
        
        renderChatList();
      }
    } else if (chatId && chatId !== currentChatId) {
      await switchToChat(chatId);
      toggleSidebar(false);
    }
  });

  // Chat form - unified flow
  const form = $('#chat-form') as HTMLFormElement;
  const input = $('#chat-input') as HTMLTextAreaElement;
  autoResize(input);

  on(form, 'submit', async (e: Event) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;

    // Show user message
    pushMessage({
      role: 'user',
      html: escapeHtml(text),
    });

    input.value = '';
    input.placeholder = 'What changes would you like to make?';

    // Assistant thinking…
    const thinkingId = pushMessage({
      role: 'assistant',
      html: `<div class="thinking">Processing your request…</div>`,
    });

    try {
      // Load current bundle
      const previousFiles = currentFiles.length > 0 
        ? currentFiles.map(f => ({ path: f.path, content: f.content }))
        : undefined;

      // Single unified API call
      const response = await generateRequest({
        threadId: currentChatId,
        userMessage: text,
        previousFiles
      });

      // Merge files
      let newFiles: AIFile[];
      if (previousFiles) {
        // Edit mode - merge changed files
        newFiles = mergeChangedFiles(previousFiles, response.files);
      } else {
        // New mode - use all files
        newFiles = response.files;
      }

      // Save bundle
      await saveBundle(currentChatId, newFiles);
      
      // Update current files
      currentFiles = newFiles.map(f => ({ ...f, included: true }));

      // Update preview with new files
      updatePreview();

      // Show response - separate summary and files into different messages
      if (response.summary) {
        replaceMessage(thinkingId, {
          role: 'assistant',
          html: `<div class="summary">${escapeHtml(response.summary)}</div>`,
        });
        
        // Add files as a separate message
        pushMessage({
          role: 'assistant',
          html: '',
          attachments: { files: currentFiles },
          actions: { simulate: true, generate: true },
        });
      } else {
        replaceMessage(thinkingId, {
          role: 'assistant',
          html: '',
          attachments: { files: currentFiles },
          actions: { simulate: true, generate: true },
        });
      }

      // Update current chat
      const currentChat = allChats.get(currentChatId);
      if (currentChat) {
        currentChat.messages = messages;
        currentChat.files = currentFiles;
        currentChat.lastModified = Date.now();
        
        // Update title if it's still "New Chat"
        if (currentChat.title === 'New Chat') {
          await updateChatTitleWithExtension(currentChat);
        }
        
        // Update last message for preview
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (lastUserMessage) {
          currentChat.lastMessage = lastUserMessage.html.replace(/<[^>]*>/g, '').trim();
        }
        
        await saveChat(currentChat);
        renderChatList();
      }

    } catch (err: any) {
      replaceMessage(thinkingId, {
        role: 'assistant',
        html: `<div class="error">Error: ${escapeHtml(err?.message || String(err))}</div>`,
      });
    }
  });

  // Messages container: delegate clicks
  on($('#messages')!, 'click', (e: Event) => {
    const t = e.target as HTMLElement;
    if (t.matches('[data-action="simulate"]')) {
      e.preventDefault();
      handleSimulate();
    } else if (t.matches('[data-action="generate-zip"]')) {
      e.preventDefault();
      handleDownloadZip();
    } else if (t.matches('[data-action="download-file"]')) {
      e.preventDefault();
      const filePath = t.getAttribute('data-file-path');
      if (filePath) {
        handleDownloadSingleFile(filePath);
      }
    } else if (t.matches('[data-toggle-file]')) {
      const path = t.getAttribute('data-toggle-file')!;
      const entry = currentFiles.find(f => f.path === path);
      if (entry) {
        entry.included = !entry.included;
        t.setAttribute('aria-pressed', String(!!entry.included));
        t.textContent = entry.included ? 'Included' : 'Excluded';
      }
    } else if (t.matches('[data-action="toggle-code"]')) {
      const pre = t.closest('.file-card')?.querySelector('pre') as HTMLElement | null;
      if (pre) {
        const open = pre.hasAttribute('hidden') ? false : true;
        if (open) pre.setAttribute('hidden', '');
        else pre.removeAttribute('hidden');
        t.textContent = open ? 'View' : 'Hide';
      }
    }
  });
  
  
  // Cleanup when window is closed
  window.addEventListener('beforeunload', () => {
    cleanupPreview();
  });
});

/* ---------- thread persistence ---------- */
async function getStoredThreadId(): Promise<string | null> {
  return new Promise((resolve) => {
    if (chrome.storage?.local) {
      chrome.storage.local.get({ cr24_threadId: null }, (result) => {
        resolve(result.cr24_threadId);
      });
    } else {
      resolve(localStorage.getItem('cr24.threadId'));
    }
  });
}

async function saveThreadId(id: string): Promise<void> {
  return new Promise((resolve) => {
    if (chrome.storage?.local) {
      chrome.storage.local.set({ cr24_threadId: id }, () => resolve());
    } else {
      localStorage.setItem('cr24.threadId', id);
      resolve();
    }
  });
}

/* ---------- API ---------- */
async function generateRequest(request: GenerateRequest): Promise<GenerateResponse> {
  const payload: any = {
    threadId: request.threadId,
    userMessage: request.userMessage,
    previousFiles: request.previousFiles,
    model,
    temperature,
  };

  // Add file summary if editing
  if (request.previousFiles) {
    payload.filesSummary = summarizeFiles(request.previousFiles);
  }

  const resp = await fetch(`${API_BASE}/api/extension-ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status}: ${txt.slice(0, 300)}`);
  }
  
  return resp.json();
}

/* ---------- render helpers ---------- */
function pushMessage(m: Omit<Msg, 'id'>): string {
  const id = crypto.randomUUID();
  const msg: Msg = { id, ...m };
  messages.push(msg);
  renderMessages();
  return id;
}

function replaceMessage(id: string, m: Omit<Msg, 'id'>) {
  const i = messages.findIndex(x => x.id === id);
  if (i >= 0) {
    messages[i] = { id, ...m };
    renderMessages();
  }
}

function renderMessages() {
  const box = $('#messages')!;
  box.innerHTML = messages.map(renderMessage).join('');
  box.scrollTop = box.scrollHeight;
}

function renderMessage(m: Msg) {
  const side = m.role === 'user' ? 'right' : 'left';
  
  const hasOnlyFiles = m.attachments?.files && (!m.html || m.html.trim() === '');
  
  if (hasOnlyFiles && m.attachments?.files) {
    // Files-only message with actions in the file bundle toolbar
    return `
      <article class="bubble ${side}">
        ${renderFilesSection(m.attachments.files)}
      </article>
    `;
  }
  
  // Regular message with optional files attachment
  const actions = m.actions ? renderActions(m.actions) : '';
  
  return `
    <article class="bubble ${side}">
      <div class="bubble-inner">${m.html}</div>
      ${m.attachments?.files ? renderFilesSection(m.attachments.files) : ''}
      ${actions}
    </article>
  `;
}

function renderActions(a: NonNullable<Msg['actions']>) {
  const buttons: string[] = [];
  // Removed simulate button since live preview is the simulation
  if (a.generate) buttons.push(`<button class="primary" data-action="generate-zip">Generate ZIP</button>`);
  return `<div class="actions">${buttons.join('')}</div>`;
}

function renderFilesHtml(files: FileEntry[]) {
  if (!files?.length) return `<div>No files generated.</div>`;
  
  const uniqueFiles = removeDuplicateFiles(files);
  const sortedFiles = sortFiles(uniqueFiles);
  
  return `<div class="file-bundle">
    <div class="file-bundle-toolbar">
      <button class="primary" data-action="generate-zip">Download ZIP</button>
    </div>
    <div class="file-list">
      ${sortedFiles.map(renderFileItem).join('')}
    </div>
  </div>`;
}

function renderFilesSection(files: FileEntry[]) {
  return `<section class="assistant-attachments">${renderFilesHtml(files)}</section>`;
}

function renderFileItem(f: FileEntry) {
  const size = new Blob([f.content]).size;
  const fileName = f.path.split('/').pop() || f.path;
  const folder = f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : '';
  
  return `
    <div class="file-item">
      <div class="file-info">
        ${folder ? `<span class="file-folder">${escapeHtml(folder)}/</span>` : ''}
        <a href="#" class="file-name" data-action="download-file" data-file-path="${escapeHtml(f.path)}" title="${escapeHtml(f.path)}">
          ${escapeHtml(fileName)}
        </a>
        <span class="file-size">(${formatFileSize(size)})</span>
      </div>
    </div>
  `;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

/* ---------- textarea autoresize ---------- */
function autoResize(ta: HTMLTextAreaElement) {
  const fit = () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(180, Math.max(36, ta.scrollHeight)) + 'px';
  };
  on(ta, 'input', fit);
  fit();
}

/* ---------- simulate & generate ---------- */
async function handleDownloadZip() {
  if (!currentFiles?.length) return;
  const selected = currentFiles.filter(f => f.included !== false);
  if (!selected.length) {
    pushMessage({ role: 'assistant', html: `<div class="error">No files selected.</div>` });
    return;
  }
  try {
    await generateZipFromFiles(
      selected.map(f => ({ path: f.path, content: f.content })),
      { name: 'AI Extension', version: '0.1.0', addIconsIfMissing: true }
    );
    pushMessage({ role: 'assistant', html: `<div class="success">ZIP generated and downloaded.</div>` });
  } catch (e: any) {
    pushMessage({ role: 'assistant', html: `<div class="error">ZIP failed: ${escapeHtml(e?.message || String(e))}</div>` });
  }
}

function handleDownloadSingleFile(filePath: string) {
  const file = currentFiles.find(f => f.path === filePath);
  if (!file) {
    pushMessage({ role: 'assistant', html: `<div class="error">File not found: ${escapeHtml(filePath)}</div>` });
    return;
  }
  
  try {
    const blob = new Blob([file.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || file.path;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e: any) {
    pushMessage({ role: 'assistant', html: `<div class="error">Download failed: ${escapeHtml(e?.message || String(e))}</div>` });
  }
}

function extractContentScriptFromGenerated(files: FileEntry[]): string | null {
  try {
    const mf = files.find(f => f.path === 'manifest.json' && f.included !== false);
    if (mf) {
      const manifest = JSON.parse(mf.content);
      const list = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
      const parts: string[] = [];
      for (const entry of list) {
        const jsArr = Array.isArray(entry.js) ? entry.js : [];
        for (const p of jsArr) {
          if (p.includes('background') || p.includes('service_worker')) continue;
          
          const file = files.find(f => f.path === p && f.included !== false);
          if (file) parts.push(file.content);
        }
      }
      
      if (parts.length) return parts.join('\n;\n');
    }
  } catch {}
  
  const byPath = files.find(f => 
    /content_script\.js$/i.test(f.path) && 
    f.included !== false &&
    !f.path.includes('background') &&
    !f.path.includes('service_worker')
  );
  if (byPath) return byPath.content;
  
  const anyJs = files.filter(f => 
    /\.js$/i.test(f.path) && 
    f.included !== false &&
    !f.path.includes('background') &&
    !f.path.includes('service_worker')
  );
  if (anyJs.length) return anyJs.map(f => f.content).join('\n;\n');
  
  return null;
}

async function handleSimulate() {
  if (!currentFiles?.length) {
    pushMessage({ role: 'assistant', html: `<div class="muted">No generated files to simulate.</div>` });
    return;
  }
  const code = extractContentScriptFromGenerated(currentFiles);
  if (!code) {
    pushMessage({ role: 'assistant', html: `<div class="muted">No content script found. Try generating again.</div>` });
    return;
  }

  const c: any = (window as any).chrome;
  if (!(c && c.scripting && typeof c.tabs?.query === 'function')) {
    pushMessage({ role: 'assistant', html: `<div class="error">Simulation requires extension context with "scripting" permission.</div>` });
    return;
  }

  try {
    c.tabs.query({ active: true, currentWindow: true }, (tabs: any[]) => {
      const tabId = tabs && tabs[0] && tabs[0].id;
      if (tabId == null) {
        pushMessage({ role: 'assistant', html: `<div class="error">No active tab found for injection.</div>` });
        return;
      }
      c.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [code],
        func: (codeStr: string) => {
          try {
            const script = document.createElement('script');
            script.textContent = codeStr;
            document.documentElement.appendChild(script);
            script.remove();
          } catch (e) {
            console.error(e);
          }
        }
      }, () => {
        const lastError = c.runtime?.lastError?.message;
        if (lastError) {
          pushMessage({ role: 'assistant', html: `<div class="error">Injection failed: ${escapeHtml(lastError)}</div>` });
        } else {
          pushMessage({ role: 'assistant', html: `<div class="success">Simulated in the current page. Check behavior and console logs.</div>` });
        }
      });
    });
  } catch (e: any) {
    pushMessage({ role: 'assistant', html: `<div class="error">Simulation failed: ${escapeHtml(e?.message || String(e))}</div>` });
  }
}
