/**
 * Cross-platform alert / confirmation. React Native's Alert.alert is a no-op on web;
 * native keeps using Alert.alert unchanged.
 */

import { Alert, Platform, type AlertButton, type AlertOptions } from 'react-native';

export type PlatformAlertButton = AlertButton;

type WebAlertRequest = {
    title: string;
    message?: string;
    buttons?: PlatformAlertButton[];
    options?: AlertOptions;
};

type WebAlertListener = (request: WebAlertRequest) => void;

let webAlertListener: WebAlertListener | null = null;

export function registerWebAlertListener(listener: WebAlertListener | null): void {
    webAlertListener = listener;
}

function formatWebPrompt(title: string, message?: string): string {
    return message ? `${title}\n\n${message}` : title;
}

function runWebSimpleAlert(title: string, message?: string, buttons?: PlatformAlertButton[]): void {
    globalThis.alert?.(formatWebPrompt(title, message));
    const primary = buttons?.[0];
    primary?.onPress?.();
}

function runWebConfirm(title: string, message: string | undefined, buttons: PlatformAlertButton[]): void {
    const cancel = buttons.find(b => b.style === 'cancel');
    const confirm =
        buttons.find(b => b.style === 'destructive') ??
        buttons.find(b => b.style !== 'cancel');

    const accepted = globalThis.confirm?.(formatWebPrompt(title, message)) ?? false;
    if (accepted) {
        confirm?.onPress?.();
    } else {
        cancel?.onPress?.();
    }
}

function runWebChoiceAlert(request: WebAlertRequest): void {
    if (webAlertListener) {
        webAlertListener(request);
        return;
    }
    runWebSimpleAlert(request.title, request.message, request.buttons);
}

function runWebAlert(title: string, message?: string, buttons?: PlatformAlertButton[]): void {
    if (!buttons || buttons.length === 0) {
        runWebSimpleAlert(title, message);
        return;
    }
    if (buttons.length === 1) {
        runWebSimpleAlert(title, message, buttons);
        return;
    }
    if (buttons.length === 2) {
        runWebConfirm(title, message, buttons);
        return;
    }
    runWebChoiceAlert({ title, message, buttons });
}

/** Drop-in replacement for Alert.alert with working web behavior. */
export function platformAlert(
    title: string,
    message?: string,
    buttons?: PlatformAlertButton[],
    options?: AlertOptions,
): void {
    if (Platform.OS === 'web') {
        runWebAlert(title, message, buttons);
        return;
    }
    Alert.alert(title, message, buttons, options);
}
