export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  displayContent?: string; // Summary text to display (excludes code block)
  isGenerating?: boolean; // True when streaming code generation
  progressStage?: number; // Progress stage index for non-streaming models
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }; // Token usage stats from OpenAI API
  estimatedTime?: number; // Estimated generation time in seconds (based on prompt tokens)
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  generatedExtension?: GeneratedExtension | null;
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

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}
