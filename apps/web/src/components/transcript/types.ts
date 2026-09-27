import type { MessagePart, Target } from '@/types';

export type TargetOf = (deviceId: string) => Target;
export type OpenImage = (image: { src: string; name?: string }) => void;
export type ToolPart = Extract<MessagePart, { kind: 'tool' }>;
export type TextPart = Extract<MessagePart, { kind: 'text' }>;
export type ActivityPart = ToolPart | Extract<MessagePart, { kind: 'reasoning' }>;
