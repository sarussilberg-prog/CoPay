import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();

jest.mock('@react-navigation/native', () => {
    const actual = jest.requireActual('@react-navigation/native');
    return {
        ...actual,
        useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn(), setOptions: mockSetOptions }),
        useRoute: () => ({ params: {} }),
        useFocusEffect: (cb: () => void) => cb(),
        useIsFocused: () => true,
    };
});

jest.mock('../../../services/dashboard.service', () => ({ fetchDashboard: jest.fn() }));

import { fetchDashboard } from '../../../services/dashboard.service';
import { ProfileScreen } from '../../../screens/profile/ProfileScreen';
import { useAppStore } from '../../../store';

const mockedFetch = fetchDashboard as jest.MockedFunction<typeof fetchDashboard>;

const dashboardPayload = {
    balanceSummary: { totalOwed: 0, totalOwedToUser: 50, defaultCurrency: 'USD', byCurrency: [{ currency: 'USD', owed: 0, owedToUser: 50 }] },
    stats: { closedGroupsCount: 1, activeGroupsCount: 2 },
    friends: [{ userId: 'u2', name: 'Bob', netBalance: 50, currency: 'USD', sharedGroupIds: ['g1'] }],
};

beforeEach(() => {
    mockNavigate.mockClear();
    mockSetOptions.mockClear();
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(dashboardPayload as any);
    useAppStore.setState({
        language: 'en',
        currentUser: { id: 'u1', email: 'a@x.com', name: 'Alice', defaultCurrency: 'USD', language: 'en', createdAt: new Date(), updatedAt: new Date() },
    });
});

describe('ProfileScreen (dashboard)', () => {
    it('renders profile row, hero, tiles, friends list', async () => {
        const { getByText, findByText } = render(<ProfileScreen />);
        expect(await findByText('Alice')).toBeTruthy();
        expect(getByText('a@x.com')).toBeTruthy();
        await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
        expect(await findByText('Bob')).toBeTruthy();
        expect(getByText('dashboard.youAreOwed')).toBeTruthy();
    });

    it('settings header button navigates to Settings', async () => {
        render(<ProfileScreen />);
        await waitFor(() => expect(mockSetOptions).toHaveBeenCalled());
        const headerRight = mockSetOptions.mock.calls[0][0].headerRight;
        const { getByTestId } = render(headerRight());
        fireEvent.press(getByTestId('profile-settings-button'));
        expect(mockNavigate).toHaveBeenCalledWith('Settings');
    });

    it('edit button navigates to EditProfile', async () => {
        const { findByTestId } = render(<ProfileScreen />);
        fireEvent.press(await findByTestId('profile-header-edit'));
        expect(mockNavigate).toHaveBeenCalledWith('EditProfile');
    });
});
