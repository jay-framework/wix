import { createJayService } from '@jay-framework/fullstack-component';
import type { GalleryItemView } from '../utils/project-gallery-items.js';

export interface WixProGalleryService {
    /** Items of a Pro Gallery in contract shape, in the gallery's order. */
    getItems(galleryId: string): Promise<GalleryItemView[]>;
}

export const WIX_PRO_GALLERY_SERVICE =
    createJayService<WixProGalleryService>('WixProGalleryService');
