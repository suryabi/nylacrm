import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL + '/api';
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });

// Download a message attachment via the authenticated API, then save it locally.
export async function downloadAttachment(messageId, att) {
  const res = await axios.get(
    `${API_URL}/gmail/messages/${messageId}/attachments/${att.attachmentId}`,
    { headers: authHeaders(), params: { filename: att.filename, mime: att.mimeType }, responseType: 'blob' },
  );
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = att.filename || 'attachment';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// Read a File into standard base64 (no data: prefix).
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Convert a FileList/array into the API attachment payload shape.
export async function filesToAttachments(files) {
  return Promise.all(
    Array.from(files).map(async (f) => ({
      filename: f.name,
      mime_type: f.type || 'application/octet-stream',
      data: await fileToBase64(f),
    })),
  );
}

export const humanSize = (bytes) => {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};
