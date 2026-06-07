import React from 'react';
import { render, RenderOptions } from '@testing-library/react-native';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../../lib/queryClient';

// Use the singleton queryClient from lib/queryClient so that
// `queryClient.setQueryData(...)` calls inside tests populate the same
// client the screens under test read from via their React Query hooks.
// Tests are expected to `queryClient.clear()` in beforeEach for isolation.
export function renderWithQuery(
    ui: React.ReactElement,
    options?: Omit<RenderOptions, 'wrapper'>,
) {
    return render(
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
        options,
    );
}
