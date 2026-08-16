import { describe, it, expect, beforeAll } from 'vitest';
import { api, loginAsCeo, createPerson, testDb } from './helpers.js';

const SAMPLE = `26 Jan\tMonday\tRepublic Day\tGazetted Holiday
4 Mar\tWednesday\tHoli\tGazetted Holiday
this line has no date in it
21 Mar\tSaturday\tRamzan Id\tGazetted Holiday`;

describe('bulk holiday import', () => {
  let ceoCookie;

  beforeAll(async () => {
    ceoCookie = await loginAsCeo();
  });

  it('imports the well-formed lines and reports the ones it could not read', async () => {
    const res = await api('/api/holidays/bulk', { method: 'POST', cookie: ceoCookie, body: { year: 2031, text: SAMPLE } });
    expect(res.status).toBe(200);
    expect(res.json.added).toBe(3);
    expect(res.json.skipped).toEqual(['this line has no date in it']);

    const rows = await testDb.holiday.findMany({
      where: { date: { gte: new Date('2031-01-01T00:00:00.000Z'), lte: new Date('2031-12-31T00:00:00.000Z') } },
      orderBy: { date: 'asc' },
    });
    expect(rows.map((r) => r.name)).toEqual(['Republic Day', 'Holi', 'Ramzan Id']);
  });

  it('re-importing the same list updates the name rather than duplicating the row', async () => {
    await api('/api/holidays/bulk', { method: 'POST', cookie: ceoCookie, body: { year: 2032, text: '26 Jan Republic Day' } });
    await api('/api/holidays/bulk', { method: 'POST', cookie: ceoCookie, body: { year: 2032, text: '26 Jan Republic Day (renamed)' } });

    const rows = await testDb.holiday.findMany({
      where: { date: new Date('2032-01-26T00:00:00.000Z') },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Republic Day (renamed)');
  });

  it('rejects a paste that parses to nothing', async () => {
    const res = await api('/api/holidays/bulk', { method: 'POST', cookie: ceoCookie, body: { year: 2033, text: 'no dates anywhere in this text' } });
    expect(res.status).toBe(400);
  });

  it('rejects a missing or absurd year', async () => {
    const missing = await api('/api/holidays/bulk', { method: 'POST', cookie: ceoCookie, body: { text: SAMPLE } });
    const absurd = await api('/api/holidays/bulk', { method: 'POST', cookie: ceoCookie, body: { year: 1500, text: SAMPLE } });
    expect(missing.status).toBe(400);
    expect(absurd.status).toBe(400);
  });

  it('a non-admin cannot bulk import', async () => {
    const person = await createPerson(ceoCookie);
    const res = await api('/api/holidays/bulk', { method: 'POST', cookie: person.cookie, body: { year: 2034, text: SAMPLE } });
    expect(res.status).toBe(403);
  });
});
