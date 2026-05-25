export {
    provideWixMediaService,
    WIX_MEDIA_SERVICE_MARKER,
    type WixMediaService,
    type MediaFileInfo,
} from './services/wix-media-service.js';

export { generateMediaIndex, generateInstructions } from './index-generator.js';

export { init } from './init.js';

export { setupWixMedia, generateWixMediaReferences } from './setup.js';
