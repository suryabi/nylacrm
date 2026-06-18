import React, { useRef, useState } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';

/**
 * Contemporary drag-and-drop upload control.
 * Purely the drop surface — the parent owns the resulting file list/chips.
 *
 * Props:
 *  - onFiles(File[])  : called with picked/dropped files
 *  - multiple, accept : native input passthrough
 *  - title, hint      : copy
 *  - busy             : show spinner + lock interaction
 *  - testId           : data-testid
 */
export const FileDropzone = ({ onFiles, multiple = false, accept, title, hint, busy = false, testId }) => {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const emit = (fileList) => {
    const arr = Array.from(fileList || []);
    if (arr.length) onFiles(arr);
  };

  const open = () => { if (!busy) inputRef.current?.click(); };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={title}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={(e) => { e.preventDefault(); setDrag(false); }}
      onDrop={(e) => { e.preventDefault(); setDrag(false); emit(e.dataTransfer.files); }}
      className={`relative group flex flex-col items-center justify-center w-full px-4 py-7 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 ${
        drag
          ? 'bg-emerald-100 border-emerald-500 scale-[1.01]'
          : 'bg-emerald-50/30 border-emerald-200 hover:bg-emerald-50/80 hover:border-emerald-400'
      } ${busy ? 'opacity-70 pointer-events-none' : ''}`}
      data-testid={testId}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => { emit(e.target.files); e.target.value = ''; }}
      />
      {busy ? (
        <Loader2 className="w-9 h-9 text-emerald-500 mb-2 animate-spin" />
      ) : (
        <UploadCloud className="w-9 h-9 text-emerald-500 mb-2 group-hover:-translate-y-1 group-hover:scale-110 transition-transform duration-300" />
      )}
      <p className="text-sm font-medium text-slate-700">{title || 'Drag & drop, or click to browse'}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
};

export default FileDropzone;
