/** @jest-environment jsdom */

import { Platform } from 'react-native';
import { platformAlert } from '../../lib/platformAlert';

const originalPlatform = Platform.OS;

describe('platformAlert (web)', () => {
    afterEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
        jest.restoreAllMocks();
    });

    beforeEach(() => {
        Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    });

    it('uses window.confirm for two-button destructive flows', () => {
        const onDelete = jest.fn();
        const confirm = jest.spyOn(globalThis, 'confirm').mockReturnValue(true);

        platformAlert('Delete group', 'Sure?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: onDelete },
        ]);

        expect(confirm).toHaveBeenCalled();
        expect(onDelete).toHaveBeenCalled();
    });

    it('invokes cancel handler when confirm is dismissed', () => {
        const onCancel = jest.fn();
        jest.spyOn(globalThis, 'confirm').mockReturnValue(false);

        platformAlert('Delete group', 'Sure?', [
            { text: 'Cancel', style: 'cancel', onPress: onCancel },
            { text: 'Delete', style: 'destructive' },
        ]);

        expect(onCancel).toHaveBeenCalled();
    });
});
