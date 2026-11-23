/**
 * Credential lifecycle validators (Design Log #63).
 * Each fixture is a project dir; `expected-findings.json` holds the CORRECT findings,
 * written by hand from the design log — never copied from validator output.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import yaml from 'js-yaml';
import { parse } from 'node-html-parser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JayHtmlValidationContext } from '@jay-framework/compiler-shared';
import { validateCredentialsPage } from '../../lib/validators/credentials-page-validator';
import { validateCredentialsProject } from '../../lib/validators/credentials-project-validator';

const FIXTURES = path.join(__dirname, 'fixtures');
const GUIDE = 'wix-members-direct-login.md';
const RULE_PREFIX = /^\[wix-members\/([a-z-]+)\]/;

interface ComparableFinding {
    file: string;
    severity: string;
    rule: string;
}

interface RawFinding {
    file: string;
    severity: string;
    message: string;
}

describe('credential lifecycle validators', () => {
    const fixtureNames = fs
        .readdirSync(FIXTURES)
        .filter((name) => fs.statSync(path.join(FIXTURES, name)).isDirectory());

    it.each(fixtureNames)('fixture %s produces exactly its expected findings', async (name) => {
        const projectRoot = path.join(FIXTURES, name);
        const expected: ComparableFinding[] = JSON.parse(
            fs.readFileSync(path.join(projectRoot, 'expected-findings.json'), 'utf8'),
        );
        const findings = await runFixture(projectRoot);
        expect(sortFindings(findings.map(toComparable))).toEqual(sortFindings(expected));
    });

    it('names the rule id and the guide in every message', async () => {
        const findings = await runFixture(path.join(FIXTURES, 'autocomplete-role'));
        expect(findings.length).toBeGreaterThan(0);
        for (const finding of findings) {
            expect(finding.message).toMatch(RULE_PREFIX);
            expect(`${finding.message} ${(finding as any).suggestion ?? ''}`).toContain(GUIDE);
        }
    });

    describe('when cwd is not the project root', () => {
        const originalCwd = process.cwd();
        afterEach(() => process.chdir(originalCwd));

        it('still matches pages by their project-relative filePath', async () => {
            process.chdir(path.join(FIXTURES, 'clean'));
            const findings = await runFixture(path.join(FIXTURES, 'password-type'));
            expect(
                findings.map(toComparable).filter((f) => f.rule === 'password-type'),
            ).toHaveLength(2);
        });
    });
});

describe('when typescript is not installed', () => {
    afterEach(() => {
        vi.doUnmock('../../lib/validators/load-typescript');
        vi.resetModules();
    });

    it('the project validator warns once and the page validator stays silent', async () => {
        vi.resetModules();
        vi.doMock('../../lib/validators/load-typescript', async (importOriginal) => {
            const actual =
                await importOriginal<typeof import('../../lib/validators/load-typescript')>();
            return {
                ...actual,
                loadTypeScript: async () => {
                    throw new actual.TypeScriptMissingError(
                        new Error("Cannot find module 'typescript'"),
                    );
                },
            };
        });
        const project = await import('../../lib/validators/credentials-project-validator');
        const page = await import('../../lib/validators/credentials-page-validator');
        const projectRoot = path.join(FIXTURES, 'password-not-in-form');

        const projectFindings = await project.validateCredentialsProject({ projectRoot });
        const pageFindings = await page.validateCredentialsPage(
            pageContext(projectRoot, 'src/pages/signup/page.jay-html'),
        );

        expect(projectFindings).toEqual([
            expect.objectContaining({
                severity: 'warning',
                file: 'package.json',
                message: expect.stringMatching(/^\[wix-members\/typescript-missing\]/),
            }),
        ]);
        expect(pageFindings).toEqual([]);
    });
});

async function runFixture(projectRoot: string): Promise<RawFinding[]> {
    const findings: RawFinding[] = [];
    for (const relativePage of listJayHtmlFiles(projectRoot)) {
        const pageFindings = await validateCredentialsPage(pageContext(projectRoot, relativePage));
        findings.push(...pageFindings.map((finding) => ({ ...finding, file: relativePage })));
    }
    findings.push(...(await validateCredentialsProject({ projectRoot })));
    return findings;
}

/** Builds the context the way jay hands it: `<body>` node, project-relative filePath. */
function pageContext(projectRoot: string, relativePage: string): JayHtmlValidationContext {
    const source = fs.readFileSync(path.join(projectRoot, relativePage), 'utf8');
    const document = parse(source);
    return {
        body: document.querySelector('body') ?? document,
        filePath: relativePage,
        projectRoot,
        validationOverrides: readPageOverrides(document),
        headlessImports: [],
    };
}

function readPageOverrides(document: ReturnType<typeof parse>) {
    const script = document.querySelector('script[type="application/jay-validations"]');
    if (!script) return undefined;
    return yaml.load(script.text) as JayHtmlValidationContext['validationOverrides'];
}

function listJayHtmlFiles(projectRoot: string, dir = projectRoot): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listJayHtmlFiles(projectRoot, full);
        return entry.name.endsWith('.jay-html') ? [path.relative(projectRoot, full)] : [];
    });
}

function toComparable(finding: RawFinding): ComparableFinding {
    const rule = finding.message.match(RULE_PREFIX)?.[1] ?? `UNPREFIXED: ${finding.message}`;
    return { file: finding.file, severity: finding.severity, rule };
}

function sortFindings(findings: ComparableFinding[]): ComparableFinding[] {
    const key = (f: ComparableFinding) => `${f.file}|${f.rule}|${f.severity}`;
    return [...findings].sort((a, b) => key(a).localeCompare(key(b)));
}
