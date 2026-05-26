export {
    provideWixMediaService,
    WIX_MEDIA_SERVICE_MARKER,
    type WixMediaService,
    type MediaFileInfo,
} from './services/wix-media-service.js';

export { generateMediaIndex } from './index-generator.js';

export { init } from './init.js';

export { setupWixMedia, generateWixMediaReferences } from './setup.js';

export { rebuildIndex } from './commands/rebuild-index.js';
export { uploadPublic } from './commands/upload-public.js';
