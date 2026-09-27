import { useState } from 'react';
import { rejectionMessage, stageImages, type StagedImage } from '@/attachments';

export function useStagedImages(onError: (message: string) => void) {
  const [images, setImages] = useState<StagedImage[]>([]);
  const [preview, setPreview] = useState<StagedImage | null>(null);

  const add = async (files: File[]) => {
    const { images: staged, rejected } = await stageImages(files);
    setImages((current) => [...current, ...staged]);
    if (rejected) onError(rejectionMessage(rejected));
  };

  const release = (gone: StagedImage[]) => {
    gone.forEach((image) => URL.revokeObjectURL(image.preview));
    setImages((current) => current.filter((image) => !gone.includes(image)));
  };

  return {
    images,
    add,
    remove: (id: string) => release(images.filter((image) => image.id === id)),
    release,
    preview,
    setPreview,
  };
}
