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

/** The Wix Bookings app, which owns every bookings service of a site. */
export const WIX_BOOKINGS_APP_ID = '13d21c63-b5ec-5912-8397-c3a5ddb27a97';

const DEFAULTS: WixBookingsConfig = {
    bookingAppId: WIX_BOOKINGS_APP_ID,
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
        bookingAppId: raw.bookingAppId || DEFAULTS.bookingAppId,
        staffResourceTypeId: raw.staffResourceTypeId ?? DEFAULTS.staffResourceTypeId,
        slotWindowDays: raw.slotWindowDays ?? DEFAULTS.slotWindowDays,
        postCheckoutUrl: raw.postCheckoutUrl ?? DEFAULTS.postCheckoutUrl,
    };
}
