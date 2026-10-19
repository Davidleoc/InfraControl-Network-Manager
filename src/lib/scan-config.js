import path from 'path';

export const dataDir = path.join(process.cwd(), 'data');
export const scanStatusPath = path.join(dataDir, 'scan-status.json');
export const debugLogPath = path.join(dataDir, 'scan_debug.log');
