import { useState } from 'react';
import { ImageOff } from 'lucide-react';
import { readImageFromAny } from '@/attachments';
import { useAsync } from '@/hooks';
import type { Target } from '@/types';
import { basename } from '@/util';
import type { OpenImage } from '@/components/transcript/types';

export function RemoteImage({
  path,
  sources,
  className,
  onOpen,
}: {
  path: string;
  sources: Target[];
  className: string;
  onOpen: OpenImage;
}) {
  const [attempt, setAttempt] = useState(0);
  const sourceKey = sources.map((s) => s.targetDeviceId ?? '').join('|');
  const image = useAsync(() => readImageFromAny(path, sources), [path, sourceKey, attempt]);
  const failed = image.error !== null;
  const name = basename(path);
  return (
    <button
      className={`remote-image ${className} ${failed ? 'failed' : ''}`}
      aria-label={failed ? `${name} unavailable, retry` : `Open ${name}`}
      onClick={() => (image.value ? onOpen({ src: image.value, name }) : failed && setAttempt(attempt + 1))}
    >
      {image.value ? <img src={image.value} alt="" /> : failed ? <ImageOff size={18} /> : <span className="spinner" />}
    </button>
  );
}
