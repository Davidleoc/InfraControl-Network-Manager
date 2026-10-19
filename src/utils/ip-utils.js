/**
 * Converts an IPv4 string to a 32-bit integer.
 * @param {string} ip 
 * @returns {number}
 */
export function ipToInt(ip) {
    if (!ip || typeof ip !== 'string' || ip.trim() === '-' || ip.trim() === '') return 0;
    const cleanIp = ip.trim();
    if (!cleanIp.includes('.')) return 0;
    try {
        return cleanIp.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    } catch (e) {
        return 0;
    }
}

/**
 * Converts a 32-bit integer back to an IPv4 string.
 * @param {number} int 
 * @returns {string}
 */
export function intToIp(int) {
    return [
        (int >>> 24) & 0xff,
        (int >>> 16) & 0xff,
        (int >>> 8) & 0xff,
        int & 0xff
    ].join('.');
}

/**
 * Generates an array of IP strings between startIp and endIp.
 * @param {string} startIp 
 * @param {string} endIp 
 * @param {number} maxEntries Optional limit to prevent huge arrays
 * @returns {string[]}
 */
export function generateIpRange(startIp, endIp, maxEntries = 512) {
    if (!startIp || startIp === '-' || !endIp || endIp === '-') return [];

    try {
        const start = ipToInt(startIp);
        const end = ipToInt(endIp);
        const range = [];

        if (start === 0 || end === 0 || start > end) return [];

        for (let i = start, count = 0; i <= end && count < maxEntries; i++, count++) {
            range.push(intToIp(i));
        }

        return range;
    } catch (e) {
        console.error('Error generating IP range:', e);
        return [];
    }
}

/**
 * Checks if a given IP is within a range.
 * @param {string} ip 
 * @param {string} startIp 
 * @param {string} endIp 
 * @returns {boolean}
 */
export function isIpInRange(ip, startIp, endIp) {
    try {
        const target = ipToInt(ip);
        const start = ipToInt(startIp);
        const end = ipToInt(endIp);
        if (start === 0 || end === 0) return false;
        return target >= start && target <= end;
    } catch (e) {
        return false;
    }
}

/**
 * Helper to get start/end from CIDR or Mask.
 * Supports strings like "192.168.10.0/255.255.255.0" or "VLAN 10 (192.168.10.0/24)"
 * @param {string} cidr 
 * @returns {{start: string, end: string}}
 */
export function cidrToRange(cidr) {
    if (!cidr || typeof cidr !== 'string') return { start: '-', end: '-' };

    // Extract IP and mask/bits using regex
    const match = cidr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s*\/\s*(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|\d{1,2})/);

    if (!match) {
        // Fallback: try to find at least one IP
        const ipMatch = cidr.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
        return ipMatch ? { start: ipMatch[0], end: ipMatch[0] } : { start: '-', end: '-' };
    }

    const ip = match[1];
    const mask = match[2];

    const base = ipToInt(ip);
    if (base === 0) return { start: ip, end: ip };

    let m;
    if (mask.includes('.')) {
        // Full mask like 255.255.255.0
        m = ipToInt(mask);
    } else {
        // CIDR notation like /24
        const bits = parseInt(mask, 10);
        if (isNaN(bits) || bits < 0 || bits > 32) return { start: ip, end: ip };
        m = (bits === 0) ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0;
    }

    if (m === 0) return { start: ip, end: ip };

    // Calculate network usable range (start at .1, end at .254 typically)
    const start = (base & m) + (m === 0xFFFFFFFF ? 0 : 1);
    const end = (base | (~m >>> 0)) - (m === 0xFFFFFFFF ? 0 : 1);

    return { start: intToIp(start), end: intToIp(end) };
}
