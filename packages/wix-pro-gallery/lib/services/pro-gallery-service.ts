import type { WixClient } from '@wix/sdk';
import { registerService } from '@jay-framework/stack-server-runtime';
import { getGalleryItems } from '../wix-apis/get-gallery.js';
import { projectGalleryItems } from '../utils/project-gallery-items.js';
import {
    WIX_PRO_GALLERY_SERVICE,
    type WixProGalleryService,
} from './pro-gallery-service-marker.js';

export function provideWixProGalleryService(wixClient: WixClient): WixProGalleryService {
    const service: WixProGalleryService = {
        async getItems(galleryId) {
            if (!galleryId) throw new Error('Pro Gallery id is missing (set the galleryId prop).');
            return projectGalleryItems(await getGalleryItems(wixClient, galleryId));
        },
    };
    registerService(WIX_PRO_GALLERY_SERVICE, service);
    return service;
}

export {
    WIX_PRO_GALLERY_SERVICE,
    type WixProGalleryService,
} from './pro-gallery-service-marker.js';
