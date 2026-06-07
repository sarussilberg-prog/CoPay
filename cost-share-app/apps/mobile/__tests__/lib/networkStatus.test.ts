import { onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { wireNetworkStatusToOnlineManager } from '../../lib/networkStatus';

jest.mock('@react-native-community/netinfo', () => ({
    __esModule: true,
    default: { addEventListener: jest.fn() },
}));

describe('wireNetworkStatusToOnlineManager', () => {
    beforeEach(() => {
        (NetInfo.addEventListener as jest.Mock).mockReset();
        onlineManager.setOnline(true);
    });

    it('subscribes to NetInfo and toggles onlineManager on state change', () => {
        let handler: (state: {
            isConnected: boolean | null;
            isInternetReachable: boolean | null;
        }) => void = () => {};
        (NetInfo.addEventListener as jest.Mock).mockImplementation((cb) => {
            handler = cb;
            return jest.fn();
        });
        const setOnlineSpy = jest.spyOn(onlineManager, 'setOnline');

        wireNetworkStatusToOnlineManager();

        handler({ isConnected: false, isInternetReachable: false });
        expect(setOnlineSpy).toHaveBeenLastCalledWith(false);

        handler({ isConnected: true, isInternetReachable: true });
        expect(setOnlineSpy).toHaveBeenLastCalledWith(true);

        handler({ isConnected: true, isInternetReachable: null });
        // Unknown reachability should default to optimistic-online.
        expect(setOnlineSpy).toHaveBeenLastCalledWith(true);
    });

    it('returns the NetInfo unsubscribe function', () => {
        const unsub = jest.fn();
        (NetInfo.addEventListener as jest.Mock).mockReturnValue(unsub);

        const result = wireNetworkStatusToOnlineManager();
        expect(result).toBe(unsub);
    });
});
