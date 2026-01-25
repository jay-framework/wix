/**
 * Wix Media URL Utilities
 * 
 * Helpers for working with Wix media URLs and the wix:// protocol formats.
 * 
 * Supported formats:
 * - wix:image://v1/<id>/<name>#originWidth=<w>&originHeight=<h>
 * - wix:video://v1/<id>/<name>#posterUri=<uri>&posterWidth=<w>&posterHeight=<h>
 * - wix:document://v1/<id>/<name>
 * - wix:audio://v1/<id>/<name>
 */

export type WixMediaType = 'image' | 'video' | 'document' | 'audio' | 'unknown';

/**
 * Parsed Wix media URL with extracted metadata
 */
export interface ParsedWixMediaUrl {
    type: WixMediaType;
    mediaId: string;
    fileName: string;
    /** Original image dimensions (for images) */
    originWidth?: number;
    originHeight?: number;
    /** Poster image info (for videos) */
    posterUri?: string;
    posterWidth?: number;
    posterHeight?: number;
}

/**
 * Parse any wix:// protocol URL and extract metadata
 */
export function parseWixMediaUrl(url: string): ParsedWixMediaUrl | null {
    if (!url) return null;
    
    // Match wix:<type>://v1/<id>/<name> with optional hash params
    const match = url.match(/^wix:(image|video|document|audio):\/\/v1\/([^/]+)\/([^#]+)(?:#(.*))?$/);
    if (!match) return null;
    
    const [, type, mediaId, fileName, hashParams] = match;
    
    const result: ParsedWixMediaUrl = {
        type: type as WixMediaType,
        mediaId,
        fileName: decodeURIComponent(fileName)
    };
    
    // Parse hash parameters if present
    if (hashParams) {
        const params = new URLSearchParams(hashParams);
        
        // Image metadata
        const originWidth = params.get('originWidth');
        const originHeight = params.get('originHeight');
        if (originWidth) result.originWidth = parseInt(originWidth, 10);
        if (originHeight) result.originHeight = parseInt(originHeight, 10);
        
        // Video metadata
        const posterUri = params.get('posterUri');
        const posterWidth = params.get('posterWidth');
        const posterHeight = params.get('posterHeight');
        if (posterUri) result.posterUri = decodeURIComponent(posterUri);
        if (posterWidth) result.posterWidth = parseInt(posterWidth, 10);
        if (posterHeight) result.posterHeight = parseInt(posterHeight, 10);
    }
    
    return result;
}

/**
 * Parse wix:image:// protocol URLs and extract the media ID
 * @deprecated Use parseWixMediaUrl for full metadata extraction
 */
export function parseWixImageUrl(url: string): string | null {
    const parsed = parseWixMediaUrl(url);
    return parsed?.type === 'image' ? parsed.mediaId : null;
}

/**
 * Parse wix:video:// protocol URLs and extract the media ID
 * @deprecated Use parseWixMediaUrl for full metadata extraction
 */
export function parseWixVideoUrl(url: string): string | null {
    const parsed = parseWixMediaUrl(url);
    return parsed?.type === 'video' ? parsed.mediaId : null;
}

/**
 * Format Wix media URL to a usable static URL.
 * Handles all wix:// protocol URLs (image, video, document, audio).
 * 
 * @param _id - The media ID (used as fallback if url is not usable)
 * @param url - The original URL (may be http(s):// or wix://)
 * @param resize - Optional resize parameters (for images/video thumbnails)
 * @returns A usable https:// URL
 */
export function formatWixMediaUrl(
    _id: string, 
    url: string, 
    resize?: { w: number; h: number }
): string {
    const resizeFragment = resize ?
        `/v1/fit/w_${resize.w},h_${resize.h},q_90/file.jpg` :
        '';
    
    // Handle wix:// protocol URLs
    if (url?.startsWith('wix:')) {
        const parsed = parseWixMediaUrl(url);
        if (parsed) {
            return `https://static.wixstatic.com/media/${parsed.mediaId}${resizeFragment}`;
        }
    }
    
    // Return URL as-is if it's a valid http(s) URL
    if (url?.startsWith('http://') || url?.startsWith('https://')) {
        return url;
    }
    
    // Fallback to constructing URL from ID
    if (_id) {
        return `https://static.wixstatic.com/media/${_id}${resizeFragment}`;
    }
    
    return '';
}

/**
 * Get the video poster URL from a wix:video:// URL
 */
export function getVideoPosterUrl(url: string, resize?: { w: number; h: number }): string {
    const parsed = parseWixMediaUrl(url);
    if (!parsed || parsed.type !== 'video') return '';
    
    // If posterUri is available, format it
    if (parsed.posterUri) {
        return formatWixMediaUrl('', parsed.posterUri, resize);
    }
    
    // Fallback: use video ID with poster endpoint
    const resizeFragment = resize ?
        `/v1/fit/w_${resize.w},h_${resize.h},q_90/file.jpg` :
        '';
    return `https://static.wixstatic.com/media/${parsed.mediaId}${resizeFragment}`;
}

/**
 * Get document download URL from a wix:document:// URL
 */
export function getDocumentUrl(url: string): string {
    const parsed = parseWixMediaUrl(url);
    if (!parsed || parsed.type !== 'document') return '';
    
    return `https://static.wixstatic.com/ugd/${parsed.mediaId}`;
}

/**
 * Get audio URL from a wix:audio:// URL
 */
export function getAudioUrl(url: string): string {
    const parsed = parseWixMediaUrl(url);
    if (!parsed || parsed.type !== 'audio') return '';
    
    return `https://static.wixstatic.com/mp3/${parsed.mediaId}`;
}
