export type Role = "user" | "assistant";

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  model?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface ChatChunk {
  id?: string;
  model?: string;
  choices?: Array<{
    delta?: { content?: string; role?: string };
    finish_reason?: string | null;
  }>;
}

export interface ModelsResponse {
  data: Array<{
    id: string;
    name?: string;
    family?: string;
    version?: string;
    released?: boolean;
  }>;
}

export type StreamingStatus = "idle" | "streaming";
