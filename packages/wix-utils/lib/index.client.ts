/**
 * Browser entry for Jay production client bundles and import maps.
 * Same surface as the main entry — all utilities are browser-safe.
 */
export {
    formatWixMediaUrl,
    stripWixMediaResize,
    parseWixMediaUrl,
    parseWixImageUrl,
    parseWixVideoUrl,
    getVideoPosterUrl,
    getDocumentUrl,
    getAudioUrl,
    type WixMediaType,
    type ParsedWixMediaUrl,
} from './media';
