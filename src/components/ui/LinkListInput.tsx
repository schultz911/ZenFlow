import React, { useState } from 'react';
import { ExternalLink, Link2, Plus, X } from 'lucide-react';
import { isValidHttpUrl } from '../../utils/taskMetadata';

interface LinkListInputProps {
  id: string;
  label: string;
  links: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  readOnly?: boolean;
  accent?: 'blue' | 'indigo';
}

export const LinkListInput: React.FC<LinkListInputProps> = ({
  id,
  label,
  links,
  onChange,
  placeholder = 'https://...',
  readOnly = false,
  accent = 'blue',
}) => {
  const [draft, setDraft] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setIsAdding(false);
      setError(null);
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      setError('Enter a valid URL starting with http:// or https://');
      return;
    }
    if (!links.includes(trimmed)) {
      onChange([...links, trimmed]);
    }
    setDraft('');
    setError(null);
    setIsAdding(false);
  };

  const accentText = accent === 'indigo'
    ? 'text-indigo-700 dark:text-indigo-400'
    : 'text-[#1d4ed8] dark:text-blue-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="field-label !mb-0" htmlFor={id}>
          {label}
        </label>
        {!readOnly && !isAdding && (
          <button
            type="button"
            onClick={() => {
              setIsAdding(true);
              setError(null);
            }}
            className={`inline-flex items-center gap-1 text-[11px] font-semibold ${accentText} hover:underline cursor-pointer`}
            style={{ minHeight: 'auto' }}
          >
            <Plus className="h-3 w-3" />
            <span>Add Link</span>
          </button>
        )}
      </div>

      {!readOnly && isAdding && (
        <div className="space-y-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <input
              id={id}
              type="url"
              value={draft}
              onChange={e => {
                setDraft(e.target.value);
                if (error) setError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                } else if (e.key === 'Escape') {
                  setIsAdding(false);
                  setDraft('');
                  setError(null);
                }
              }}
              onBlur={e => {
                const action = (e.relatedTarget as HTMLElement | null)?.dataset?.linkAction;
                if (action === 'cancel' || action === 'add') return;
                handleAdd();
              }}
              placeholder={placeholder}
              autoFocus
              className="field-control flex-1"
            />
            <button
              type="button"
              data-link-action="add"
              onClick={handleAdd}
              className="button-primary shrink-0"
            >
              Add
            </button>
            <button
              type="button"
              data-link-action="cancel"
              onClick={() => {
                setIsAdding(false);
                setDraft('');
                setError(null);
              }}
              className="button-secondary shrink-0"
            >
              Cancel
            </button>
          </div>
          {error && <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}

      {links.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {links.map((url, idx) => (
            <div
              key={`${url}-${idx}`}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-[5px] bg-[var(--surface)] border border-[var(--border)] text-xs text-[var(--text-primary)] max-w-full"
            >
              <Link2 className={`h-3 w-3 shrink-0 ${accentText}`} />
              {isValidHttpUrl(url) ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={url}
                  className="truncate max-w-[230px] hover:underline"
                >
                  {url}
                </a>
              ) : (
                <span title={url} className="truncate max-w-[230px]">{url}</span>
              )}
              <ExternalLink className="h-2.5 w-2.5 shrink-0 text-[var(--text-muted)]" />
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onChange(links.filter((_, i) => i !== idx))}
                  aria-label="Remove link"
                  className="text-[var(--text-muted)] hover:text-red-600 dark:hover:text-red-400 ml-0.5 cursor-pointer"
                  style={{ minHeight: 'auto' }}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        readOnly && <p className="text-[11px] text-[var(--text-secondary)] italic">No reference links added</p>
      )}
    </div>
  );
};
