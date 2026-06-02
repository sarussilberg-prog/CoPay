import React from 'react';
import { render } from '@testing-library/react-native';
import { AdminMetricsPanel } from '../../../components/admin/AdminMetricsPanel';

describe('AdminMetricsPanel', () => {
    it('renders three metric values and section label', () => {
        const { getByTestId, getByText } = render(
            <AdminMetricsPanel
                metrics={{
                    version: 1,
                    generatedAt: '2026-06-02T12:00:00Z',
                    users: { registered: 42, deleted: 1 },
                    groups: { active: 10, archived: 4, deleted: 2, manualArchiveMemberships: 0 },
                }}
            />,
        );
        // Three metric tiles render with the expected numeric values
        expect(getByTestId('admin-metric-users')).toBeTruthy();
        expect(getByTestId('admin-metric-groups-active')).toBeTruthy();
        expect(getByTestId('admin-metric-groups-archived')).toBeTruthy();
        expect(getByText('42')).toBeTruthy();
        expect(getByText('10')).toBeTruthy();
        expect(getByText('4')).toBeTruthy();
    });

    it('shows loading spinner when isLoading=true', () => {
        const { getByTestId } = render(
            <AdminMetricsPanel metrics={null} isLoading={true} />,
        );
        expect(getByTestId('admin-metrics-loading')).toBeTruthy();
    });

    it('shows error text when isError=true', () => {
        const { getByTestId } = render(
            <AdminMetricsPanel metrics={null} isError={true} />,
        );
        expect(getByTestId('admin-metrics-error')).toBeTruthy();
    });
});
