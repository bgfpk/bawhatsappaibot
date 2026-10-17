import fs from 'fs';
import path from 'path';

const STATUS_FILE = path.join(process.cwd(), 'backups', 'app_status.json');

export function getAppStatus(): 'LIVE' | 'MAINTENANCE' {
    if (process.env.NODE_ENV === 'production') return 'LIVE';

    try {
        if (fs.existsSync(STATUS_FILE)) {
            const data = fs.readFileSync(STATUS_FILE, 'utf8');
            const parsed = JSON.parse(data);
            if (parsed.status === 'LIVE' || parsed.status === 'MAINTENANCE') {
                return parsed.status;
            }
        }
    } catch (e) {
        console.error("[Status] Error reading status file:", e);
    }

    return 'LIVE';
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
