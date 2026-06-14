const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// The "Bundle React Native code and images" build phase sources ios/.xcode.env
// before running `expo export:embed`. Without NODE_ENV=production, @expo/env
// loads .env.production but .env wins for shared keys (first-set-wins), and dev
// Supabase leaks into release bundles.
const MARKER = '# [withReleaseNodeEnv] NODE_ENV=production for Release/Archive — .env.production wins';
const LINE = '[ "$CONFIGURATION" = "Release" ] && export NODE_ENV=production';

function appendBlock(filePath) {
    const contents = fs.readFileSync(filePath, 'utf8');
    if (contents.includes(MARKER)) return;
    const sep = contents.endsWith('\n') ? '\n' : '\n\n';
    fs.writeFileSync(filePath, `${contents}${sep}${MARKER}\n${LINE}\n`);
}

module.exports = function withReleaseNodeEnv(config) {
    return withDangerousMod(config, [
        'ios',
        (cfg) => {
            const xcodeEnv = path.join(cfg.modRequest.platformProjectRoot, '.xcode.env');
            if (fs.existsSync(xcodeEnv)) appendBlock(xcodeEnv);
            return cfg;
        },
    ]);
};
