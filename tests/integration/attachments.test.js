import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAsCeo, createPerson } from './helpers.js';
import { BASE_URL } from './config.js';

// A real 1x1 PNG, base64 — small, valid, byte-exact roundtrip is checkable.
const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

describe('task attachments', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('uploads, lists and byte-exactly serves an image', async () => {
    const person = await createPerson(ceoCookie);
    const task = await api('/api/tasks', {
      method: 'POST',
      cookie: person.cookie,
      body: { title: 'Has an image', assigneeId: person.id },
    });

    const upload = await api(`/api/tasks/${task.json.id}/attachments`, {
      method: 'POST',
      cookie: person.cookie,
      body: { filename: 'pixel.png', mimeType: 'image/png', data: TINY_PNG_B64 },
    });
    expect(upload.status).toBe(200);
    expect(upload.json.attachment.size).toBe(Buffer.from(TINY_PNG_B64, 'base64').length);

    const list = await api(`/api/tasks/${task.json.id}/attachments`, { cookie: person.cookie });
    expect(list.json.attachments).toHaveLength(1);
    expect(list.json.attachments[0].filename).toBe('pixel.png');

    const fileRes = await fetch(
      `${BASE_URL}/api/tasks/${task.json.id}/attachments/${upload.json.attachment.id}`,
      { headers: { Cookie: person.cookie } },
    );
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    expect(fileRes.headers.get('content-type')).toBe('image/png');
    expect(Buffer.compare(bytes, Buffer.from(TINY_PNG_B64, 'base64'))).toBe(0);
  });

  it('rejects a file over the size cap', async () => {
    const person = await createPerson(ceoCookie);
    const task = await api('/api/tasks', {
      method: 'POST',
      cookie: person.cookie,
      body: { title: 'Too big', assigneeId: person.id },
    });

    const huge = Buffer.alloc(5 * 1024 * 1024, '0').toString('base64'); // 5MB, over the 4MB cap
    const res = await api(`/api/tasks/${task.json.id}/attachments`, {
      method: 'POST',
      cookie: person.cookie,
      body: { filename: 'huge.bin', mimeType: 'application/octet-stream', data: huge },
    });
    expect(res.status).toBe(413);
  });

  it('rejects empty file data', async () => {
    const person = await createPerson(ceoCookie);
    const task = await api('/api/tasks', {
      method: 'POST',
      cookie: person.cookie,
      body: { title: 'Empty upload', assigneeId: person.id },
    });
    const res = await api(`/api/tasks/${task.json.id}/attachments`, {
      method: 'POST',
      cookie: person.cookie,
      body: { filename: 'nothing.txt', mimeType: 'text/plain', data: '' },
    });
    expect(res.status).toBe(400);
  });

  it('someone with no relation to the task cannot view its page, attach to it, or read its files', async () => {
    const owner = await createPerson(ceoCookie);
    const stranger = await createPerson(ceoCookie);
    const task = await api('/api/tasks', {
      method: 'POST',
      cookie: owner.cookie,
      body: { title: "Not stranger's business", assigneeId: owner.id },
    });
    const upload = await api(`/api/tasks/${task.json.id}/attachments`, {
      method: 'POST',
      cookie: owner.cookie,
      body: { filename: 'pixel.png', mimeType: 'image/png', data: TINY_PNG_B64 },
    });

    const uploadAttempt = await api(`/api/tasks/${task.json.id}/attachments`, {
      method: 'POST',
      cookie: stranger.cookie,
      body: { filename: 'x.png', mimeType: 'image/png', data: TINY_PNG_B64 },
    });
    expect(uploadAttempt.status).toBe(403);

    const listAttempt = await api(`/api/tasks/${task.json.id}/attachments`, { cookie: stranger.cookie });
    expect(listAttempt.status).toBe(403);

    const fileRes = await fetch(
      `${BASE_URL}/api/tasks/${task.json.id}/attachments/${upload.json.attachment.id}`,
      { headers: { Cookie: stranger.cookie } },
    );
    expect(fileRes.status).toBe(404);
  });

  it('an unauthenticated request is rejected outright', async () => {
    const person = await createPerson(ceoCookie);
    const task = await api('/api/tasks', {
      method: 'POST',
      cookie: person.cookie,
      body: { title: 'Needs a session', assigneeId: person.id },
    });
    const res = await api(`/api/tasks/${task.json.id}/attachments`, {
      method: 'POST',
      body: { filename: 'x.png', mimeType: 'image/png', data: TINY_PNG_B64 },
    });
    expect(res.status).toBe(401);
  });
});
