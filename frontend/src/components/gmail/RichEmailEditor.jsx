import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import '../../styles/email-quill.css';

const MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link'],
    ['clean'],
  ],
};
const FORMATS = ['bold', 'italic', 'underline', 'strike', 'list', 'link', 'image'];

const RichEmailEditor = forwardRef(function RichEmailEditor(
  { value, onChange, placeholder = 'Write your message...', autoGrow = false, onFocus },
  ref
) {
  const quillRef = useRef(null);

  useImperativeHandle(ref, () => ({
    // Insert text at the current caret (or end if the editor was never focused).
    insertAtCursor(text) {
      const quill = quillRef.current?.getEditor?.();
      if (!quill) return;
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      quill.insertText(index, text, 'user');
      quill.setSelection(index + text.length, 0, 'user');
    },
    focus() {
      quillRef.current?.getEditor?.()?.focus();
    },
  }), []);

  return (
    <div className={`email-quill ${autoGrow ? 'email-quill--grow' : ''}`} data-testid="rich-email-editor">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        value={value || ''}
        onChange={onChange}
        onFocus={onFocus}
        modules={MODULES}
        formats={FORMATS}
        placeholder={placeholder}
      />
    </div>
  );
});

export default RichEmailEditor;
