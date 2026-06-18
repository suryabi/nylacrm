import React, { useRef } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import '../../styles/email-quill.css';
import { Button } from '../ui/button';
import { Image as ImageIcon } from 'lucide-react';

const MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline'],
    [{ color: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};
const FORMATS = ['bold', 'italic', 'underline', 'strike', 'color', 'list', 'link', 'image'];

/**
 * Rich-text editor for building an email signature. Adds an "Insert company
 * logo" action that embeds the tenant logo (hosted URL) so it renders in
 * recipients' inboxes.
 */
export default function SignatureEditor({ value, onChange, logoUrl, placeholders = [] }) {
  const quillRef = useRef(null);

  const editorAt = () => {
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return null;
    const range = editor.getSelection(true);
    return { editor, index: range ? range.index : editor.getLength() };
  };

  const insertLogo = () => {
    if (!logoUrl) return;
    const ctx = editorAt();
    if (!ctx) return;
    ctx.editor.insertEmbed(ctx.index, 'image', logoUrl, 'user');
    ctx.editor.setSelection(ctx.index + 1, 0);
  };

  const insertPlaceholder = (key) => {
    const ctx = editorAt();
    if (!ctx) return;
    const token = `{{${key}}}`;
    ctx.editor.insertText(ctx.index, token, 'user');
    ctx.editor.setSelection(ctx.index + token.length, 0);
  };

  return (
    <div className="email-quill" data-testid="signature-editor">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {placeholders.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 text-xs"
            onClick={() => insertPlaceholder(p.key)}
            data-testid={`signature-placeholder-${p.key}`}
          >
            + {p.label}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 ml-auto"
          onClick={insertLogo}
          disabled={!logoUrl}
          title={logoUrl ? 'Insert your company logo' : 'No company logo configured in branding'}
          data-testid="signature-insert-logo"
        >
          <ImageIcon className="h-3.5 w-3.5 mr-1.5" /> Insert company logo
        </Button>
      </div>
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={MODULES}
        formats={FORMATS}
        placeholder="e.g. {{name}} — {{title}} · {{phone}}"
      />
    </div>
  );
}
