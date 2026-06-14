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
export default function SignatureEditor({ value, onChange, logoUrl }) {
  const quillRef = useRef(null);

  const insertLogo = () => {
    if (!logoUrl) return;
    const editor = quillRef.current?.getEditor?.();
    if (!editor) return;
    const range = editor.getSelection(true);
    const index = range ? range.index : editor.getLength();
    editor.insertEmbed(index, 'image', logoUrl, 'user');
    editor.setSelection(index + 1, 0);
  };

  return (
    <div className="email-quill" data-testid="signature-editor">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">Design your signature</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
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
        placeholder="e.g. Jane Doe — Sales Manager · +91 98765 43210"
      />
    </div>
  );
}
