/**
 * Wix Media URL Utilities
 * 
 * Helpers for working with Wix media URLs and the wix:image:// / wix:video:// protocols.
 */

/**
 * Parse wix:image:// protocol URLs and extract the media ID
 * Format: wix:image://v1/{mediaId}/{filename}#{params}
 */
export function parseWixImageUrl(url: string): string | null {
    const match = url.match(/^wix:image:\/\/v1\/([^/]+)\//);
    return match ? match[1] : null;
}

/**
 * Parse wix:video:// protocol URLs and extract the media ID
 * Format: wix:video://v1/{mediaId}/{filename}#{params}
 */
export function parseWixVideoUrl(url: string): string | null {
    const match = url.match(/^wix:video:\/\/v1\/([^/]+)\//);
    return match ? match[1] : null;
}

/**
 * Parse any wix media protocol URL (image or video)
 */
function parseWixMediaUrl(url: string): string | null {
    return parseWixImageUrl(url) || parseWixVideoUrl(url);
}

/**
 * Format Wix media URL with optional resize parameters.
 * Handles both regular URLs and wix:image:// / wix:video:// protocol URLs.
 * 
 * @param _id - The media ID (used as fallback if url is not usable)
 * @param url - The original URL (may be http(s):// or wix:image:// or wix:video://)
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
    
    // Handle wix:image:// or wix:video:// protocol URLs
    if (url?.startsWith('wix:image://') || url?.startsWith('wix:video://')) {
        const mediaId = parseWixMediaUrl(url);
        if (mediaId) {
            return `https://static.wixstatic.com/media/${mediaId}${resizeFragment}`;
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
