export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  apiKey: string;
  model: 'gpt-5' | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-4-turbo' | 'gpt-4' | 'gpt-3.5-turbo';
  temperature: number;
}

export interface GeneratedExtension {
  manifest: any;
  files: {
    [key: string]: string;
  };
  type: 'popup' | 'content-script' | 'background';
}

export interface PreviewState {
  extension: GeneratedExtension | null;
  isLoading: boolean;
  error: string | null;
}
