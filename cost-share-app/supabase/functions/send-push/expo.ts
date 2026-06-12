export interface ExpoMessage {
    to: string;
    title: string;
    body: string;
    data: Record<string, unknown>;
    sound: 'default';
    badge?: number;
}

export interface ExpoSendResult {
    ticketIds: string[];
    invalidTokens: string[];
}

interface ExpoTicket {
    status: 'ok' | 'error';
    id?: string;
    details?: { error?: string };
}

export async function sendExpoPush(
    messages: ExpoMessage[],
    fetchFn: typeof fetch = fetch,
): Promise<ExpoSendResult> {
    if (messages.length === 0) return { ticketIds: [], invalidTokens: [] };

    const res = await fetchFn('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages),
    });
    if (!res.ok) throw new Error(`expo_push_http_${res.status}`);

    const json = (await res.json()) as { data?: ExpoTicket[] };
    const ticketIds: string[] = [];
    const invalidTokens: string[] = [];
    (json.data ?? []).forEach((ticket, i) => {
        if (ticket.status === 'ok' && ticket.id) {
            ticketIds.push(ticket.id);
        } else if (ticket.details?.error === 'DeviceNotRegistered') {
            invalidTokens.push(messages[i].to);
        }
    });
    return { ticketIds, invalidTokens };
}
