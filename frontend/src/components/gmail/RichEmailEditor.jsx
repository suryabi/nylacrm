import React from 'react';
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
const FORMATS = ['bold', 'italic', 'underline', 'strike', 'list', 'link'];

export default function RichEmailEditor({ value, onChange, placeholder = 'Write your message...' }) {
  return (
    <div className="email-quill" data-testid="rich-email-editor">
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        modules={MODULES}
        formats={FORMATS}
        placeholder={placeholder}
      />
    </div>
  );
}
