import { reportError } from '@/toast';

export function copyText(text: string): Promise<void> {
  const write = navigator.clipboard?.writeText(text) ?? Promise.reject();
  return write.catch(() => reportError(new Error("Couldn't copy to the clipboard")));
}
