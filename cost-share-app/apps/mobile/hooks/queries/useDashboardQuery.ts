import { useQuery } from '@tanstack/react-query';
import { fetchDashboard } from '../../services/dashboard.service';
import { queryKeys } from './keys';

export function useDashboardQuery() {
    return useQuery({
        queryKey: queryKeys.dashboard,
        queryFn: fetchDashboard,
    });
}
