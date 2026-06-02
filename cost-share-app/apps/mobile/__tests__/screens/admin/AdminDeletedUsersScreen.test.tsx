const mockListDeletedAccounts = jest.fn();
const mockRestoreDeletedAccount = jest.fn();
jest.mock('../../../services/admin.service', () => ({
    listDeletedAccounts: (...a: any[]) => mockListDeletedAccounts(...a),
    restoreDeletedAccount: (...a: any[]) => mockRestoreDeletedAccount(...a),
}));

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { AdminDeletedUsersScreen } from '../../../screens/admin/AdminDeletedUsersScreen';

beforeEach(() => {
    mockListDeletedAccounts.mockReset();
    mockRestoreDeletedAccount.mockReset();
});

const sampleRow = {
    userId: 'u1',
    email: 'a@test.local',
    deletedAt: new Date('2026-06-01T10:00:00Z'),
    reason: 'self_service',
    openBalanceSnapshot: null,
    notes: null,
};

describe('AdminDeletedUsersScreen', () => {
    it('renders the list when RPC returns rows', async () => {
        mockListDeletedAccounts.mockResolvedValue([sampleRow]);
        render(<AdminDeletedUsersScreen />);
        await waitFor(() => expect(screen.getByText('a@test.local')).toBeTruthy());
    });

    it('shows the empty state when RPC returns no rows', async () => {
        mockListDeletedAccounts.mockResolvedValue([]);
        render(<AdminDeletedUsersScreen />);
        await waitFor(() =>
            expect(screen.getByText(/no deleted users|אין משתמשים|admin\.deletedUsers\.empty/i)).toBeTruthy()
        );
    });

    it('calls restore RPC and refreshes the list on confirm', async () => {
        mockListDeletedAccounts
            .mockResolvedValueOnce([sampleRow])
            .mockResolvedValueOnce([]);
        mockRestoreDeletedAccount.mockResolvedValue({ ok: true });

        render(<AdminDeletedUsersScreen />);
        await waitFor(() => screen.getByText('a@test.local'));

        fireEvent.press(screen.getByTestId('admin-restore-u1'));
        fireEvent.press(screen.getByTestId('admin-restore-confirm'));

        await waitFor(() => expect(mockRestoreDeletedAccount).toHaveBeenCalledWith('u1'));
        await waitFor(() => expect(mockListDeletedAccounts).toHaveBeenCalledTimes(2));
    });
});
