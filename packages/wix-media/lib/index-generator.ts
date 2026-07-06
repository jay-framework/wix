import type { MediaFileInfo } from './services/wix-media-service.js';

function formatDimensions(file: MediaFileInfo): string {
    if (file.width && file.height) {
        return `${file.width}x${file.height}`;
    }
    return '-';
}

function formatLabels(labels: string[]): string {
    return labels.length > 0 ? labels.join(', ') : '-';
}

function escapeMarkdownCell(value: string): string {
    return value.replace(/\|/g, '\\|');
}

export function generateMediaIndex(files: MediaFileInfo[]): string {
    const lines: string[] = [];

    lines.push('# Available Media');
    lines.push('');
    lines.push('| Folder | Slug | Display Name | Type | Dimensions | Labels | URL |');
    lines.push('| ------ | ---- | ------------ | ---- | ---------- | ------ | --- |');

    for (const file of files) {
        lines.push(
            `| ${escapeMarkdownCell(file.folderName)} | ${file.slug} | ${escapeMarkdownCell(file.displayName)} | ${file.mediaType} | ${formatDimensions(file)} | ${formatLabels(file.labels)} | ${file.url} |`,
        );
    }

    lines.push('');

    return lines.join('\n');
}
