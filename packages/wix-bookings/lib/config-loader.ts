import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

export interface WixBookingsConfig {
    bookingAppId: string;
    staffResourceTypeId: string;
    slotWindowDays: number;
    postCheckoutUrl: string;
}

const CONFIG_FILE = '.wix-bookings.yaml';

const DEFAULTS: WixBookingsConfig = {
    bookingAppId: '',
    staffResourceTypeId: '',
    slotWindowDays: 14,
    postCheckoutUrl: '/',
};

export function loadWixBookingsConfig(projectRoot: string): WixBookingsConfig {
    const configPath = path.join(projectRoot, 'config', CONFIG_FILE);
    if (!fs.existsSync(configPath)) {
        return { ...DEFAULTS };
    }

    const raw = yaml.load(fs.readFileSync(configPath, 'utf-8')) as Partial<WixBookingsConfig>;
    return {
        bookingAppId: raw.bookingAppId ?? DEFAULTS.bookingAppId,
        staffResourceTypeId: raw.staffResourceTypeId ?? DEFAULTS.staffResourceTypeId,
        slotWindowDays: raw.slotWindowDays ?? DEFAULTS.slotWindowDays,
        postCheckoutUrl: raw.postCheckoutUrl ?? DEFAULTS.postCheckoutUrl,
    };
}
