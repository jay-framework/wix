import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export interface WixConfig {
    apiKey: string;
    siteId: string;
}

export function loadConfig(): WixConfig {
    // Resolve the config path relative to the process execution path
    const configPath = path.join(process.cwd(), 'config', '.wix.yaml');
    
    // Check if the config file exists
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found at: ${configPath}`);
    }
    
    // Read and parse the YAML file
    const fileContents = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(fileContents) as any;
    
    // Validate the config structure
    if (!config) {
        throw new Error('Config file is empty or invalid');
    }
    
    if (!config.apiKeyStrategy) {
        throw new Error('Config validation failed: "apiKeyStrategy" section is required');
    }
    
    const strategy = config.apiKeyStrategy;
    
    if (!strategy.apiKey) {
        throw new Error('Config validation failed: "apiKeyStrategy.apiKey" is required');
    }
    
    if (typeof strategy.apiKey !== 'string' || strategy.apiKey.trim() === '') {
        throw new Error('Config validation failed: "apiKeyStrategy.apiKey" must be a non-empty string');
    }
    
    if (!strategy.siteId) {
        throw new Error('Config validation failed: "apiKeyStrategy.siteId" is required');
    }
    
    if (typeof strategy.siteId !== 'string' || strategy.siteId.trim() === '') {
        throw new Error('Config validation failed: "apiKeyStrategy.siteId" must be a non-empty string');
    }
    
    return {
        apiKey: strategy.apiKey,
        siteId: strategy.siteId,
    };
}

