import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const AIDITOR_SETTINGS_OUTPUT_REL = 'agent-kit/aiditor/settings/wix-media.yaml';

export function writeAiditorSettingsContribution(
    projectRoot: string,
    templatePath: string,
    force = false,
): string | null {
    const outputPath = path.join(projectRoot, AIDITOR_SETTINGS_OUTPUT_REL);
    if (fs.existsSync(outputPath) && !force) {
        return null;
    }
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.copyFileSync(templatePath, outputPath);
    return AIDITOR_SETTINGS_OUTPUT_REL;
}

export function materializeWixMediaAiditorSettings(
    projectRoot: string,
    force = false,
): string | null {
    const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    const templatePath = path.join(packageRoot, 'agent-kit', 'aiditor', 'settings.template.yaml');
    if (!fs.existsSync(templatePath)) {
        return null;
    }
    return writeAiditorSettingsContribution(projectRoot, templatePath, force);
}
