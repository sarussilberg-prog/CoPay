import { useAppStore } from '../../store';

beforeEach(() => {
    useAppStore.setState({
        session: null,
        currentUser: null,
        language: 'en',
    });
});

describe('useAppStore', () => {
    describe('session', () => {
        it('starts with null session', () => {
            expect(useAppStore.getState().session).toBeNull();
            expect(useAppStore.getState().currentUser).toBeNull();
        });

        it('setSession(null) clears session and currentUser', () => {
            useAppStore.setState({ currentUser: { id: 'u1' } as any });
            useAppStore.getState().setSession(null);
            expect(useAppStore.getState().session).toBeNull();
            expect(useAppStore.getState().currentUser).toBeNull();
        });

        // Regression: setSession used to rebuild currentUser from session.user with
        // defaultCurrency='ILS' and language='en' placeholders, which clobbered the
        // real DB row that hydrateCurrentUserProfile had just set. That made Settings
        // show the placeholder while the dashboard RPC (which reads the DB directly)
        // showed the real value.
        it('setSession(session) does not clobber a hydrated currentUser', () => {
            const hydratedUser = {
                id: 'user-123',
                email: 'test@example.com',
                name: 'Test User',
                defaultCurrency: 'MAD',
                language: 'he',
                isActive: true,
                inviteToken: '',
                createdAt: new Date('2026-01-01'),
                updatedAt: new Date('2026-01-02'),
            } as any;
            useAppStore.setState({ currentUser: hydratedUser });

            const mockSession = {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    user_metadata: { full_name: 'Test User', avatar_url: 'http://x/a.png' },
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-02T00:00:00Z',
                },
            } as any;
            useAppStore.getState().setSession(mockSession);

            const user = useAppStore.getState().currentUser;
            expect(user).toBe(hydratedUser);
            expect(user?.defaultCurrency).toBe('MAD');
            expect(user?.language).toBe('he');
            expect(useAppStore.getState().session).toBe(mockSession);
        });

        it('setSession(session) leaves currentUser null when nothing was hydrated', () => {
            const mockSession = {
                user: {
                    id: 'user-123',
                    email: 'test@example.com',
                    user_metadata: { full_name: 'Test User' },
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-02T00:00:00Z',
                },
            } as any;
            useAppStore.getState().setSession(mockSession);
            expect(useAppStore.getState().session).toBe(mockSession);
            expect(useAppStore.getState().currentUser).toBeNull();
        });
    });

    describe('language', () => {
        it('starts in English', () => {
            expect(useAppStore.getState().language).toBe('en');
        });

        it('setLanguage updates the language', () => {
            useAppStore.getState().setLanguage('he');
            expect(useAppStore.getState().language).toBe('he');
        });
    });
});
