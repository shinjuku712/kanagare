import { useCallback, useEffect, useRef, useState } from 'react';
import type { Attachment } from '@shared/types';
import { api } from '../api.ts';
import { refreshSoon, toast } from '../store.ts';
import { formatBytes } from '../lib/util.ts';
import { IconEdit, IconFile, IconPlus, IconX, useEscape } from './ui.tsx';

/** Card attachments (uploads and text snippets): pick, drag-drop, or paste an image. */
export function CardFiles({
  cardId,
  editable,
  attachments,
  reload,
  onOpenSnippet,
  onNewSnippet,
}: {
  cardId: number;
  editable: boolean;
  attachments: Attachment[];
  reload: () => void;
  onOpenSnippet: (id: number) => void;
  onNewSnippet: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      for (const f of list) {
        setBusy(f.name);
        try {
          await api.uploadFile(cardId, f);
        } catch (e) {
          toast(e instanceof Error ? e.message : `Could not upload ${f.name}`);
        }
      }
      setBusy(null);
      reload();
      refreshSoon();
    },
    [cardId, reload],
  );

  // Paste an image straight onto the card (screenshots).
  useEffect(() => {
    if (!editable) return;
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Don't hijack pasting text into the title, notes or comment box.
      if (target?.closest('textarea, input, [contenteditable]')) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (files.length) {
        e.preventDefault();
        void upload(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [editable, upload]);

  const remove = async (a: Attachment) => {
    try {
      if (a.storage_key) await api.deleteFile(a.id);
      else await api.deleteAttachment(a.id);
      reload();
      refreshSoon();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not remove attachment');
    }
  };

  const images = attachments.filter((a) => a.mime?.startsWith('image/'));
  const others = attachments.filter((a) => !a.mime?.startsWith('image/'));

  const hasAny = attachments.length > 0;
  if (!hasAny && !editable) return null;

  return (
    <div
      className={'detail-files' + (dragOver ? ' is-dragover' : '') + (hasAny ? '' : ' empty')}
      onDragOver={(e) => {
        if (!editable) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!editable) return;
        e.preventDefault();
        setDragOver(false);
        void upload(e.dataTransfer.files);
      }}
    >
      {hasAny && (
        <h3>
          Files
          <span className="count">{attachments.length}</span>
          {editable && (
            <span className="file-actions">
              <button className="icon-btn" aria-label="Write a text snippet" title="Write a text snippet" onClick={onNewSnippet}>
                <IconEdit size={14} />
              </button>
              <button className="icon-btn" aria-label="Upload file" title="Upload file" onClick={() => inputRef.current?.click()}>
                <IconPlus size={14} />
              </button>
            </span>
          )}
        </h3>
      )}

      {/* Image thumbnails first — they're the ones worth seeing at a glance. */}
      {images.length > 0 && (
        <div className="file-thumbs">
          {images.map((a) => (
            <figure key={a.id} className="file-thumb">
              <button className="thumb-open" onClick={() => setPreview(a)} aria-label={`Preview ${a.filename}`}>
                <img src={api.fileUrl(a.id)} alt={a.filename} loading="lazy" />
              </button>
              {editable && (
                <button className="thumb-x" aria-label={`Remove ${a.filename}`} onClick={() => remove(a)}>
                  <IconX size={12} />
                </button>
              )}
              <figcaption title={a.filename}>{a.filename}</figcaption>
            </figure>
          ))}
        </div>
      )}

      {others.map((a) => (
        <div key={a.id} className="file-row-wrap">
          {a.storage_key ? (
            <a className="file-row" href={api.fileUrl(a.id)} target="_blank" rel="noreferrer">
              <span className="ftype">{fileType(a.filename)}</span>
              <span className="fname">{a.filename}</span>
              <span className="flang">{formatBytes(a.size_bytes)}</span>
            </a>
          ) : (
            <button className="file-row" onClick={() => onOpenSnippet(a.id)}>
              <span className="ftype">
                <IconFile size={13} />
              </span>
              <span className="fname">{a.filename}</span>
              {a.language && <span className="flang">{a.language}</span>}
            </button>
          )}
          {editable && (
            <button className="icon-btn danger" aria-label={`Remove ${a.filename}`} onClick={() => remove(a)}>
              <IconX size={13} />
            </button>
          )}
        </div>
      ))}

      {busy && <div className="file-uploading">Uploading {busy}…</div>}

      {editable && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void upload(e.target.files);
              e.target.value = '';
            }}
          />
          {!hasAny && (
            <div className="file-empty-actions">
              <button className="attach-inline" onClick={() => inputRef.current?.click()}>
                <IconPlus size={13} />
                Attach file
              </button>
              <button className="attach-inline" onClick={onNewSnippet}>
                Write a snippet
              </button>
              <span className="file-hint">or drop files here · paste a screenshot</span>
            </div>
          )}
        </>
      )}

      {preview && <Lightbox file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

/** "PDF", "XLSX"… from the file name, shown where an icon would be. */
function fileType(name: string): string {
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : '';
  return ext.length <= 4 ? ext || 'FILE' : 'FILE';
}

function Lightbox({ file, onClose }: { file: Attachment; onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={file.filename} onClick={onClose}>
      <img src={api.fileUrl(file.id)} alt={file.filename} onClick={(e) => e.stopPropagation()} />
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="grow">{file.filename}</span>
        <span className="lb-size">{formatBytes(file.size_bytes)}</span>
        <a className="btn sm" href={api.fileUrl(file.id, true)}>
          Download
        </a>
        <button className="btn sm ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
