import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.join(process.cwd(), 'backups', 'app_status.json');

export function getAppStatus(): 'LIVE' | 'MAINTENANCE' {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) return 'LIVE'; // Shared App URL always uses LIVE db
    
    try {
        if (fs.existsSync(STATUS_FILE)) {
            const data = fs.readFileSync(STATUS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            return parsed.status as 'LIVE' | 'MAINTENANCE';
        }
    } catch (e) {
        console.error("[Status] Error reading status file:", e);
    }
    return 'LIVE'; // Defaulting to LIVE as requested, unless Admin explicitly toggles to MAINTENANCE
}

export function setAppStatus(status: 'LIVE' | 'MAINTENANCE') {
    try {
        const dir = path.dirname(STATUS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(STATUS_FILE, JSON.stringify({ status }));
    } catch (e) {
        console.error("[Status] Error writing status file:", e);
    }
}
