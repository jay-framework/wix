function sanitizeIdentifier(value: string): string {
    return value
        .replace(/[^a-zA-Z0-9\s_-]/g, ' ')
        .replace(/[\s_-]+/g, ' ')
        .trim();
}

export function toPascalCase(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

export function formContractName(formId: string, title: string, usedNames: Set<string>): string {
    const slug = toPascalCase(sanitizeIdentifier(title || 'Form'));
    const baseName = `${slug || 'Form'}Form`;

    if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
    }

    const suffix = formId.replace(/-/g, '').slice(0, 8).toLowerCase();
    const collisionName = `${baseName}_${suffix}`;
    usedNames.add(collisionName);
    return collisionName;
}

export function contractNameToKebab(contractName: string): string {
    return contractName
        .replace(/([A-Z])/g, '-$1')
        .toLowerCase()
        .replace(/^-/, '');
}
