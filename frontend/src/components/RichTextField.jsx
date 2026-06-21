import React from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import '../styles/proposal-quill.css';

const MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'clean'],
  ],
};
const FORMATS = ['bold', 'italic', 'underline', 'strike', 'color', 'list', 'link'];

// Reusable rich-text editor for the proposal builder. Outputs HTML, which the
// backend converts to ReportLab markup. Treats Quill's empty value as ''.
export default function RichTextField({ value, onChange, placeholder = 'Write here…', testId, minHeight = 110 }) {
  const handleChange = (html) => {
    onChange(html === '<p><br></p>' ? '' : html);
  };
  return (
    <div className="proposal-rich" data-testid={testId} style={{ '--rt-min': `${minHeight}px` }}>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={handleChange}
        modules={MODULES}
        formats={FORMATS}
        placeholder={placeholder}
      />
    </div>
  );
}
