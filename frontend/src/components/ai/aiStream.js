// Shared SSE reader for AI endpoints. onEvent receives parsed JSON events:
// {session_id}, {delta}, {error}, {done}.
const API_URL = process.env.REACT_APP_BACKEND_URL;

export async function streamAI(path, body, onEvent) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = 'AI request failed';
    try { detail = (await res.json()).detail || detail; } catch { /* noop */ }
    throw new Error(detail);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop();
    for (const p of parts) {
      const line = p.trim();
      if (!line.startsWith('data: ')) continue;
      try { onEvent(JSON.parse(line.slice(6))); } catch { /* skip malformed */ }
    }
  }
}
