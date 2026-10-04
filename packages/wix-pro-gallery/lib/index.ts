/**
 * Server entry: service registration and the pro-gallery headless component.
 */
export { init } from './init.js';
export { proGallery, DEFAULT_INTERVAL_MS, type ProGalleryProps } from './components/pro-gallery.js';
export {
    provideWixProGalleryService,
    WIX_PRO_GALLERY_SERVICE,
    type WixProGalleryService,
} from './services/pro-gallery-service.js';
export { projectGalleryItems, type GalleryItemView } from './utils/project-gallery-items.js';
