type HarnessId = string;
export type SessionStatus = 'idle' | 'working' | 'awaitingInput' | 'errored';

export interface ChatConfig {
  harness: HarnessId;
  model?: string | null;
  reasoning?: string | null;
  modelOptions?: Record<string, unknown>;
  sandbox: string;
}

export interface Chat {
  id: string;
  deviceId: string;
  title?: string | null;
  archived: boolean;
  cwd?: string | null;
  branch?: string | null;
  config?: ChatConfig | null;
  lastMessagePreview?: string | null;
  lastMessageAt?: string | null;
  createdAt: string;
  spaceId?: string | null;
  parentChatId?: string | null;
  lastSeenAt?: string | null;
  checkoutId?: string | null;
}

export interface Space {
  id: string;
  deviceId: string;
  path: string;
  name?: string | null;
  gitDetected: boolean;
  checkoutId?: string | null;
  createdAt: string;
}

export interface Device {
  id: string;
  name: string;
  platform: string;
  lastSeenAt?: string | null;
  version?: string | null;
  capabilities?: string[];
}

export interface Session {
  chatId: string;
  deviceId: string;
  status: SessionStatus;
  startedAt?: string | null;
  updatedAt: string;
  lastCompletedTurn?: string | null;
}

export interface HarnessInfo {
  id: HarnessId;
  name: string;
  supportsSteering: boolean;
  steeringMode: 'step-boundary' | 'turn-boundary';
  reasoningLevels: string[];
  installed: boolean;
  enabled?: boolean | null;
}

interface ModelOption {
  id: string;
  label: string;
  choices: { id: string; label: string }[];
  defaultChoice: string;
}

export interface Model {
  id: string;
  label: string;
  description?: string | null;
  reasoningLevels: string[];
  options: ModelOption[];
}

export type ToolCall =
  | { kind: 'exec'; command: string }
  | { kind: 'readFile'; path: string }
  | { kind: 'writeFile'; path: string }
  | { kind: 'editFile'; path: string; oldString?: string; newString?: string }
  | { kind: 'applyPatch'; path?: string }
  | { kind: 'search'; pattern: string; path?: string }
  | { kind: 'glob'; pattern: string }
  | { kind: 'webFetch'; url: string }
  | { kind: 'webSearch'; query: string }
  | { kind: 'todo'; items: { text: string; done: boolean }[] }
  | { kind: 'mcp'; server: string; tool: string; input?: unknown }
  | { kind: 'unknown'; name: string; input?: unknown };

interface UserInputQuestion {
  id: string;
  header: string;
  question: string;
  options: string[];
  multiSelect?: boolean;
}

interface DiffStat {
  path: string;
  additions: number;
  deletions: number;
}

export type MessagePart =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'reasoning'; id: string; text: string }
  | { kind: 'image'; id: string; path: string; name: string; mimeType: string }
  | {
      kind: 'tool';
      id: string;
      call: ToolCall;
      isError?: boolean;
      resolved?: boolean;
      output?: string | null;
      outputRef?: string | null;
      outputBytes?: number | null;
      diffStats?: DiffStat[] | null;
      subagentStatus?: string | null;
      subagentTail?: string | null;
    }
  | { kind: 'input'; id: string; requestId: string; questions: UserInputQuestion[]; resolved?: boolean }
  | { kind: 'error'; id: string; message: string }
  | { kind: 'fork'; id: string; sourceChatId: string };

export interface Entry {
  id: string;
  role: 'user' | 'assistant' | 'system';
  parts: MessagePart[];
  createdAt: number;
  deviceId: string;
  status?: 'streaming' | 'complete' | 'aborted' | null;
  continuationOf?: string | null;
  durationMs?: number | null;
}

export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: string[];
  holdForTurnEnd?: boolean;
  issuedBy: string;
  issuedAt: number;
  editedAt?: number | null;
  deliveryGate?: { kind: string; ownerDeviceId?: string; expiresAtMs?: number } | null;
}

export interface SidebarPreferences {
  revision: number;
  synced: boolean;
  initialized: boolean;
  pinnedSessionIds: string[];
}

interface FolderEntry {
  name: string;
  isDir: boolean;
  isRepo: boolean;
}

export interface FolderListing {
  path: string;
  entries: FolderEntry[];
  truncated: boolean;
}

export interface RepoRef {
  name: string;
  current: boolean;
  worktreePath?: string | null;
}

export interface ChangeRequest {
  provider: string;
  number: number;
  title: string;
  url: string;
  state: 'open' | 'closed' | 'merged';
  baseRef: string;
  headRef: string;
}

export interface CheckoutChangeRequestStatus {
  checkoutId: string;
  deviceId: string;
  cwd: string;
  branch: string;
  changeRequest: ChangeRequest | null;
  updatedAt: string;
}

export interface AttachmentChunk {
  name: string;
  mimeType: string;
  data: string;
  nextOffset: number;
  done: boolean;
}

export type Target = { targetDeviceId?: string };

export type InputPart = Extract<MessagePart, { kind: 'input' }>;
