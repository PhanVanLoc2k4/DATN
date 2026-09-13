const { networkInterfaces } = require('node:os');
const { spawnSync } = require('node:child_process');

const hotspotAddress = '192.168.137.1';
const hasHotspot = Object.values(networkInterfaces()).flat().some(
  (address) => address && address.family === 'IPv4' && address.address === hotspotAddress
);

if (!hasHotspot) {
  console.error(`Windows hotspot IP ${hotspotAddress} is unavailable. Enable Mobile hotspot and check ipconfig.`);
  process.exit(1);
}

console.log(`Connect your phone to the PC hotspot. Expo: exp://${hotspotAddress}:8081`);
const result = spawnSync(process.execPath, [
  require.resolve('expo/bin/cli'), 'start', '--go', '--lan', '--clear', ...process.argv.slice(2),
], {
  stdio: 'inherit',
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: hotspotAddress },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
