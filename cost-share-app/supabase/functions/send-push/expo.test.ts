import { assertEquals } from '@std/assert';
import { sendExpoPush, type ExpoMessage } from './expo.ts';

const msg: ExpoMessage = { to: 'ExponentPushToken[x]', title: 't', body: 'b', data: {}, sound: 'default' };

Deno.test('collects ticket ids and flags DeviceNotRegistered tokens', async () => {
    const fakeFetch = ((_url: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(JSON.stringify({
            data: [
                { status: 'ok', id: 'ticket-1' },
                { status: 'error', details: { error: 'DeviceNotRegistered' } },
            ],
        }), { status: 200 }))) as typeof fetch;

    const bad: ExpoMessage = { ...msg, to: 'ExponentPushToken[dead]' };
    const res = await sendExpoPush([msg, bad], fakeFetch);
    assertEquals(res.ticketIds, ['ticket-1']);
    assertEquals(res.invalidTokens, ['ExponentPushToken[dead]']);
});

Deno.test('empty message list short-circuits', async () => {
    const res = await sendExpoPush([], fetch);
    assertEquals(res, { ticketIds: [], invalidTokens: [] });
});
