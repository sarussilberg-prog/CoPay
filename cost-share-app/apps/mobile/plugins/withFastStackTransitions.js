const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const DURATION_MS = 150;

// react-native-screens applies the `ios_from_*` Android transitions via fixed XML
// resources (config_shortAnimTime ≈ 200ms); `animationDuration` is iOS-only. We
// override these resource names in the app module so they run at DURATION_MS.
// Revisit on react-native-screens upgrades: if these names change, the override
// silently stops applying and Android falls back to ~200ms (no crash).
const ANIMS = {
    rns_ios_from_right_foreground_open: { interpolator: true, from: '100%', to: '0%' },
    rns_ios_from_right_background_open: { interpolator: false, from: '0%', to: '-30%' },
    rns_ios_from_right_foreground_close: { interpolator: true, from: '0%', to: '100%' },
    rns_ios_from_right_background_close: { interpolator: false, from: '-30%', to: '0%' },
    rns_ios_from_left_foreground_open: { interpolator: true, from: '-100%', to: '0%' },
    rns_ios_from_left_background_open: { interpolator: false, from: '0%', to: '30%' },
    rns_ios_from_left_foreground_close: { interpolator: true, from: '0%', to: '-100%' },
    rns_ios_from_left_background_close: { interpolator: false, from: '30%', to: '0%' },
};

function animXml({ interpolator, from, to }) {
    const interpolatorLine = interpolator
        ? '\n    android:interpolator="@android:interpolator/accelerate_decelerate"'
        : '';
    return `<?xml version="1.0" encoding="utf-8"?>
<translate xmlns:android="http://schemas.android.com/apk/res/android"
    android:duration="${DURATION_MS}"${interpolatorLine}
    android:fromXDelta="${from}"
    android:toXDelta="${to}" />
`;
}

function writeFastTransitionAnims(animDir) {
    fs.mkdirSync(animDir, { recursive: true });
    for (const [name, def] of Object.entries(ANIMS)) {
        fs.writeFileSync(path.join(animDir, `${name}.xml`), animXml(def));
    }
    return Object.keys(ANIMS);
}

function withFastStackTransitions(config) {
    return withDangerousMod(config, [
        'android',
        (cfg) => {
            const animDir = path.join(
                cfg.modRequest.platformProjectRoot,
                'app',
                'src',
                'main',
                'res',
                'anim',
            );
            writeFastTransitionAnims(animDir);
            return cfg;
        },
    ]);
}

module.exports = withFastStackTransitions;
module.exports.writeFastTransitionAnims = writeFastTransitionAnims;
module.exports.DURATION_MS = DURATION_MS;
