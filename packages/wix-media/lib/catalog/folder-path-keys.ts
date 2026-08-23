export function folderPathKey(folderPath: string[]): string {
    return folderPath.join('\u0001');
}

export function parseFolderPathJson(folderPathJson: string): string[] {
    const parsed = JSON.parse(folderPathJson) as unknown;
    if (!Array.isArray(parsed)) {
        throw new Error('Invalid folder path.');
    }
    return parsed.map((segment) => String(segment));
}
