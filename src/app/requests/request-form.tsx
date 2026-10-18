'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import type { Screenshot } from '@/factory/cursor';
import { MAX_SCREENSHOTS } from '@/factory/policy';
import type { SubmitResult } from '@/factory/service';
import { submitFeatureRequest } from './actions';

const MAX_EDGE = 1280;

const shrink = async (file: File): Promise<Screenshot> => {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.8).split(',')[1]! };
};

export function RequestForm({ quotaNote, outOfFeatures }: { quotaNote: string; outOfFeatures?: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [shots, setShots] = useState<Screenshot[]>([]);
  const [result, setResult] = useState<SubmitResult>();
  const [pending, startTransition] = useTransition();

  const addFiles = async (files: FileList | null) => {
    const added = await Promise.all([...(files ?? [])].slice(0, MAX_SCREENSHOTS - shots.length).map(shrink));
    setShots((current) => [...current, ...added].slice(0, MAX_SCREENSHOTS));
    if (fileInput.current) fileInput.current.value = '';
  };

  const submit = () =>
    startTransition(async () => {
      const outcome = await submitFeatureRequest(text, shots);
      setResult(outcome);
      if (outcome.ok) {
        setText('');
        setShots([]);
        router.refresh();
      }
    });

  return (
    <form
      className="panel request-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label>
        What should we build or fix?
        <textarea
          rows={4}
          value={text}
          maxLength={2000}
          onChange={(event) => setText(event.target.value)}
          placeholder="e.g. Show each strategy's longest losing streak on its Track record tab"
        />
      </label>
      {shots.length > 0 && (
        <ul className="shots">
          {shots.map((shot, index) => (
            <li key={index}>
              <img src={`data:${shot.mimeType};base64,${shot.data}`} alt={`Screenshot ${index + 1}`} />
              <button type="button" className="icon" aria-label={`Remove screenshot ${index + 1}`} onClick={() => setShots(shots.filter((_, i) => i !== index))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="request-actions">
        <button type="button" className="secondary" disabled={shots.length >= MAX_SCREENSHOTS} onClick={() => fileInput.current?.click()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="M21 16l-5-5-8 8" />
          </svg>
          Screenshot
        </button>
        <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(event) => addFiles(event.target.files)} />
        <button type="submit" className="primary" disabled={pending || text.trim().length < 10}>
          {pending ? (
            <>
              <span className="spinner" aria-hidden="true" /> Reviewing…
            </>
          ) : (
            'Send request'
          )}
        </button>
      </div>
      <p className="fine">{quotaNote}</p>
      {outOfFeatures && !result && <p className="notice warn">{outOfFeatures}</p>}
      {result && <p className={`notice ${result.ok ? (result.status === 'declined' ? 'warn' : 'pos') : 'warn'}`}>{result.message}</p>}
    </form>
  );
}

export function AutoRefresh({ every = 15000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), every);
    return () => clearInterval(timer);
  }, [router, every]);
  return null;
}
