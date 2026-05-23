import { assertProfileActiveWithTimeout } from '../../lib/auth';

const mockMaybeSingle = jest.fn();
const mockRpc = jest.fn();
const mockClearStaleAuthSession = jest.fn().mockResolvedValue(undefined);
const mockSetSession = jest.fn();

jest.mock('../../lib/authSessionLifecycle', () => ({
    clearStaleAuthSession: (...args: unknown[]) => mockClearStaleAuthSession(...args),
}));

jest.mock('../../store', () => ({
    useAppStore: {
        getState: () => ({ setSession: mockSetSession }),
    },
}));

jest.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
        },
        rpc: (...args: unknown[]) => mockRpc(...args),
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            maybeSingle: mockMaybeSingle,
        })),
    },
}));

describe('assertProfileActiveWithTimeout', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        mockMaybeSingle.mockReset();
        mockRpc.mockReset();
        mockClearStaleAuthSession.mockClear();
        mockSetSession.mockClear();
        mockRpc.mockResolvedValue({ data: true, error: null });
        mockMaybeSingle.mockResolvedValue({ data: { is_active: true }, error: null });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('returns deactivated when is_caller_active RPC is false', async () => {
        mockRpc.mockResolvedValue({ data: false, error: null });
        await expect(assertProfileActiveWithTimeout(100)).resolves.toBe('deactivated');
        expect(mockClearStaleAuthSession).toHaveBeenCalled();
        expect(mockSetSession).toHaveBeenCalledWith(null);
    });

    it('returns deactivated when profile is inactive', async () => {
        mockMaybeSingle.mockResolvedValue({ data: { is_active: false }, error: null });
        await expect(assertProfileActiveWithTimeout(100)).resolves.toBe('deactivated');
        expect(mockClearStaleAuthSession).toHaveBeenCalled();
        expect(mockSetSession).toHaveBeenCalledWith(null);
    });

    it('fail-opens to active when the profile check exceeds the timeout', async () => {
        mockRpc.mockReturnValue(new Promise(() => {}));
        mockMaybeSingle.mockReturnValue(new Promise(() => {}));
        const pending = assertProfileActiveWithTimeout(50);
        jest.advanceTimersByTime(50);
        await expect(pending).resolves.toBe('active');
    });

    it('fail-closes to deactivated after OAuth when the profile check exceeds the timeout', async () => {
        mockRpc.mockReturnValue(new Promise(() => {}));
        mockMaybeSingle.mockReturnValue(new Promise(() => {}));
        const pending = assertProfileActiveWithTimeout(50, { failOpen: false });
        jest.advanceTimersByTime(50);
        await expect(pending).resolves.toBe('deactivated');
    });
});
