import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PluginSetupContext, PluginSetupResult } from '@jay-framework/stack-server-runtime';
import { loadWixMembersConfig } from './config-loader.js';

const CONFIG_FILE_NAME = '.wix-members.yaml';

const CONFIG_TEMPLATE = `# Wix Members Configuration
#
# Auth callback URL — the route that handles the OAuth redirect after login/register.
# Must match a page in your site (e.g. src/pages/auth/callback/page.jay-html).
# Relative paths are resolved against the site origin at runtime.
authCallbackUrl: "/auth/callback"
`;

const AUTH_CALLBACK_PAGE = `<html>
  <head>
    <title>Signing in...</title>
    <meta name="description" content="Authentication callback — please wait while we sign you in.">
    <script type="application/jay-headless" plugin="@jay-framework/wix-members" contract="auth-callback"></script>
    <script type="application/jay-data">
      data:
    </script>
    <style>
      .auth-callback {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 2rem;
      }

      .auth-callback-content {
        text-align: center;
        max-width: 400px;
      }

      .auth-callback-content h1 {
        font-size: 1.5rem;
        font-weight: 600;
        margin-bottom: 0.75rem;
      }

      .auth-callback-content p {
        color: var(--color-text-muted);
      }

      .auth-error {
        color: #dc2626;
      }
    </style>
  </head>
  <body>
    <jay:auth-callback>
      <main class="auth-callback">
        <div class="auth-callback-content">
          <div if="isProcessing">
            <h1>Signing you in...</h1>
            <p>Please wait while we complete your login.</p>
          </div>
          <div if="hasError">
            <h1>Something went wrong</h1>
            <p class="auth-error">{errorMessage}</p>
            <p><a href="/">Return to homepage</a></p>
          </div>
        </div>
      </main>
    </jay:auth-callback>
  </body>
</html>
`;

export async function setupWixMembers(ctx: PluginSetupContext): Promise<PluginSetupResult> {
    if (ctx.initError) {
        return {
            status: 'error',
            message: `Service init failed (is wix-server-client configured?). ${ctx.initError.message}`,
        };
    }

    const configCreated: string[] = [];
    const configPath = path.join(ctx.configDir, CONFIG_FILE_NAME);

    if (!fs.existsSync(configPath)) {
        if (!fs.existsSync(ctx.configDir)) {
            fs.mkdirSync(ctx.configDir, { recursive: true });
        }
        fs.writeFileSync(configPath, CONFIG_TEMPLATE, 'utf-8');
        configCreated.push(`config/${CONFIG_FILE_NAME}`);
    }

    const config = loadWixMembersConfig(ctx.projectRoot);

    const callbackUrl = config.authCallbackUrl;
    if (!callbackUrl.startsWith('/')) {
        return {
            status: 'configured',
            configCreated,
            message: `Wix Members configured (external callback: ${callbackUrl})`,
        };
    }

    const routeSegments = callbackUrl.replace(/^\//, '').split('/');
    const pagesDir = path.join(ctx.projectRoot, 'src', 'pages');
    const candidatePaths = [
        path.join(pagesDir, ...routeSegments, 'page.jay-html'),
        path.join(pagesDir, ...routeSegments.slice(0, -1), routeSegments.at(-1) + '.jay-html'),
    ];

    const hasCallbackPage = candidatePaths.some((p) => fs.existsSync(p));

    if (!hasCallbackPage) {
        const expectedPath = `src/pages/${routeSegments.join('/')}/page.jay-html`;

        const create = await ctx.prompt.confirm({
            key: 'create-auth-callback',
            message: `Auth callback page missing. Create ${expectedPath}?`,
            default: true,
        });

        if (create) {
            const fullPath = path.join(ctx.projectRoot, expectedPath);
            fs.mkdirSync(path.dirname(fullPath), { recursive: true });
            fs.writeFileSync(fullPath, AUTH_CALLBACK_PAGE, 'utf-8');
            configCreated.push(expectedPath);
        } else {
            return {
                status: 'needs-config',
                configCreated,
                message: `Auth callback page missing: create ${expectedPath} using the auth-callback contract.`,
            };
        }
    }

    return {
        status: 'configured',
        configCreated,
        message: `Wix Members configured (callback: ${callbackUrl})`,
    };
}
