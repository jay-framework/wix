import * as fs from 'node:fs';
import * as path from 'node:path';
import type * as TypeScript from 'typescript';
import { loadTypeScript, type TypeScriptApi } from './load-typescript';
import { loadJayConfigForCredentials } from './load-validation-suppressions';

/**
 * Finds the pages that log members in or register them, by reading page TS (Design Log #63 →
 * Detection). Pure apart from reading files; memoized per project + file fingerprint so the page
 * and project validators of one `jay-stack validate` run share a single scan.
 */

export type AuthCall = 'login' | 'register';
type MemberCall = AuthCall | 'sendPasswordReset';

export interface AuthPage {
    /** Absolute path of the `page.jay-html` next to the page's TS. */
    pageJayHtml: string;
    calls: Set<AuthCall>;
}

export interface StorageWrite {
    /** Project-relative path. */
    file: string;
    key: string;
    line: number;
}

export interface CredentialScan {
    pages: AuthPage[];
    /** Project-relative page TS files that call `login(`, sorted. */
    loginCallers: string[];
    projectCallsReset: boolean;
    storageWrites: StorageWrite[];
}

const MEMBERS_MODULES = new Set([
    '@jay-framework/wix-members',
    '@jay-framework/wix-members/client',
]);
const CONTEXT_EXPORT = 'WIX_MEMBERS_CONTEXT';
const MEMBER_CALLS = new Set<MemberCall>(['login', 'register', 'sendPasswordReset']);
const STORAGE_RECEIVERS = new Set(
    ['localStorage', 'sessionStorage'].flatMap((name) => [
        name,
        `window.${name}`,
        `globalThis.${name}`,
    ]),
);
const PAGE_FILE = /^page\.tsx?$/;
const TS_FILE = /\.tsx?$/;

interface CachedScan {
    fingerprint: string;
    scan: CredentialScan;
    importedFiles: string[];
}

const cache = new Map<string, CachedScan>();

export async function findAuthPages(projectRoot: string): Promise<CredentialScan> {
    const { pagesDir } = loadJayConfigForCredentials(projectRoot);
    const pageFiles = listTsFiles(pagesDir).filter((file) => PAGE_FILE.test(path.basename(file)));
    const srcFiles = listTsFiles(path.join(projectRoot, 'src'));
    const cached = cache.get(projectRoot);
    const fingerprintOf = (extra: string[]) => fingerprint([...pageFiles, ...srcFiles, ...extra]);
    if (cached && cached.fingerprint === fingerprintOf(cached.importedFiles)) return cached.scan;

    const ts = await loadTypeScript();
    const scanner = new ProjectScanner(ts, projectRoot);
    const scan = scanner.scan(pageFiles, srcFiles);
    cache.set(projectRoot, {
        scan,
        importedFiles: scanner.importedFiles,
        fingerprint: fingerprintOf(scanner.importedFiles),
    });
    return scan;
}

class ProjectScanner {
    readonly importedFiles: string[] = [];

    constructor(
        private readonly ts: TypeScriptApi,
        private readonly projectRoot: string,
    ) {}

    scan(pageFiles: string[], srcFiles: string[]): CredentialScan {
        const pages: AuthPage[] = [];
        const loginCallers: string[] = [];
        let projectCallsReset = false;
        for (const pageFile of [...pageFiles].sort()) {
            const calls = this.memberCallsInPage(pageFile);
            if (calls.has('sendPasswordReset')) projectCallsReset = true;
            if (calls.has('login')) loginCallers.push(this.relative(pageFile));
            const authCalls = new Set([...calls].filter(isAuthCall));
            const pageJayHtml = path.join(path.dirname(pageFile), 'page.jay-html');
            if (authCalls.size && fs.existsSync(pageJayHtml)) {
                pages.push({ pageJayHtml: path.resolve(pageJayHtml), calls: authCalls });
            }
        }
        const storageWrites = srcFiles.flatMap((file) => this.storageWritesIn(file));
        return { pages, loginCallers, projectCallsReset, storageWrites };
    }

    private memberCallsInPage(pageFile: string): Set<MemberCall> {
        const sourceFile = this.parse(pageFile);
        const contextName = importedContextName(this.ts, sourceFile);
        const calls = new Set<MemberCall>();
        if (!contextName) return calls;
        this.visit(sourceFile, (node) => {
            const component = this.interactiveContextParameter(node, sourceFile, contextName);
            if (!component) return;
            const helpers = (name: string) =>
                this.resolveRelativeImport(sourceFile, pageFile, name);
            for (const call of this.callsThroughContext(
                component.body,
                component.parameter,
                helpers,
            )) {
                calls.add(call);
            }
        });
        return calls;
    }

    /** For a `.withInteractive(fn)` call, the body of `fn` and its WIX_MEMBERS_CONTEXT parameter. */
    private interactiveContextParameter(
        node: TypeScript.Node,
        sourceFile: TypeScript.SourceFile,
        contextName: string,
    ): { body: TypeScript.Node; parameter: TypeScript.BindingName } | undefined {
        const ts = this.ts;
        if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
        if (node.expression.name.text !== 'withInteractive') return;
        const chain = builderChain(ts, node.expression.expression);
        const contexts = chain.get('withContexts') ?? [];
        const contextIndex = contexts.findIndex(
            (arg) => ts.isIdentifier(arg) && arg.text === contextName,
        );
        if (contextIndex < 0) return;
        // Interactive params: (props, refs[, signals, carryForward], ...contexts) — the two extra
        // params exist only when the chain has .withFastRender (fullstack-component builder).
        const prefix = chain.has('withFastRender') ? 4 : 2;
        const fn = resolveFunction(ts, sourceFile, node.arguments[0]);
        const parameter = fn?.parameters[prefix + contextIndex];
        if (!fn?.body || !parameter) return;
        return { body: fn.body, parameter: parameter.name };
    }

    private callsThroughContext(
        body: TypeScript.Node,
        parameter: TypeScript.BindingName,
        resolveHelper?: (name: string) => HelperFunction | undefined,
    ): Set<MemberCall> {
        const ts = this.ts;
        const contextNames = new Set<string>();
        const methodAliases = new Map<string, string>();
        bindContextName(ts, parameter, contextNames, methodAliases);
        this.visit(body, (node) => {
            if (!ts.isVariableDeclaration(node) || !node.initializer) return;
            if (ts.isIdentifier(node.initializer) && contextNames.has(node.initializer.text)) {
                bindContextName(ts, node.name, contextNames, methodAliases);
            }
        });

        const calls = new Set<MemberCall>();
        const addIfMemberCall = (name: string) => {
            if (MEMBER_CALLS.has(name as MemberCall)) calls.add(name as MemberCall);
        };
        this.visit(body, (node) => {
            if (!ts.isCallExpression(node)) return;
            const callee = node.expression;
            if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
                if (contextNames.has(callee.expression.text)) addIfMemberCall(callee.name.text);
                return;
            }
            if (!ts.isIdentifier(callee)) return;
            const aliased = methodAliases.get(callee.text);
            if (aliased) return addIfMemberCall(aliased);
            const argIndex = node.arguments.findIndex(
                (arg) => ts.isIdentifier(arg) && contextNames.has(arg.text),
            );
            const helper = argIndex >= 0 ? resolveHelper?.(callee.text) : undefined;
            const helperParameter = helper?.fn.parameters[argIndex];
            if (!helper?.fn.body || !helperParameter) return;
            // One level only: helpers' own helpers are not followed (Design Log #63 → Detection).
            for (const call of this.callsThroughContext(helper.fn.body, helperParameter.name)) {
                calls.add(call);
            }
        });
        return calls;
    }

    private resolveRelativeImport(
        sourceFile: TypeScript.SourceFile,
        fromFile: string,
        localName: string,
    ): HelperFunction | undefined {
        const ts = this.ts;
        for (const statement of sourceFile.statements) {
            if (
                !ts.isImportDeclaration(statement) ||
                !ts.isStringLiteral(statement.moduleSpecifier)
            ) {
                continue;
            }
            const specifier = statement.moduleSpecifier.text;
            if (!specifier.startsWith('.')) continue;
            const named = statement.importClause?.namedBindings;
            if (!named || !ts.isNamedImports(named)) continue;
            const element = named.elements.find((e) => e.name.text === localName);
            if (!element) continue;
            const file = resolveModuleFile(path.resolve(path.dirname(fromFile), specifier));
            if (!file) return;
            this.importedFiles.push(file);
            const target = this.parse(file);
            const fn = findTopLevelFunction(
                ts,
                target,
                (element.propertyName ?? element.name).text,
            );
            return fn ? { fn } : undefined;
        }
    }

    private storageWritesIn(file: string): StorageWrite[] {
        const ts = this.ts;
        const sourceFile = this.parse(file);
        const writes: StorageWrite[] = [];
        this.visit(sourceFile, (node) => {
            if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression))
                return;
            if (node.expression.name.text !== 'setItem') return;
            if (!STORAGE_RECEIVERS.has(node.expression.expression.getText(sourceFile))) return;
            const key = node.arguments[0];
            if (!key || !(ts.isStringLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)))
                return;
            const line =
                sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
            writes.push({ file: this.relative(file), key: key.text, line });
        });
        return writes;
    }

    private parse(file: string): TypeScript.SourceFile {
        const kind = file.endsWith('.tsx') ? this.ts.ScriptKind.TSX : this.ts.ScriptKind.TS;
        const text = fs.readFileSync(file, 'utf8');
        return this.ts.createSourceFile(file, text, this.ts.ScriptTarget.Latest, true, kind);
    }

    private visit(node: TypeScript.Node, onNode: (node: TypeScript.Node) => void): void {
        onNode(node);
        this.ts.forEachChild(node, (child) => this.visit(child, onNode));
    }

    private relative(file: string): string {
        return path.relative(this.projectRoot, file).split(path.sep).join('/');
    }
}

interface HelperFunction {
    fn: TypeScript.SignatureDeclaration & { body?: TypeScript.Node };
}

function isAuthCall(call: MemberCall): call is AuthCall {
    return call === 'login' || call === 'register';
}

function importedContextName(
    ts: TypeScriptApi,
    sourceFile: TypeScript.SourceFile,
): string | undefined {
    for (const statement of sourceFile.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
            continue;
        if (!MEMBERS_MODULES.has(statement.moduleSpecifier.text)) continue;
        const named = statement.importClause?.namedBindings;
        if (!named || !ts.isNamedImports(named)) continue;
        const element = named.elements.find(
            (e) => (e.propertyName ?? e.name).text === CONTEXT_EXPORT,
        );
        if (element) return element.name.text;
    }
}

/** Method name → arguments, for every call in a `a().b(x).c(y)` builder chain. */
function builderChain(
    ts: TypeScriptApi,
    expression: TypeScript.Expression,
): Map<string, readonly TypeScript.Expression[]> {
    const chain = new Map<string, readonly TypeScript.Expression[]>();
    let current: TypeScript.Expression = expression;
    while (ts.isCallExpression(current)) {
        const callee = current.expression;
        if (!ts.isPropertyAccessExpression(callee)) break;
        chain.set(callee.name.text, current.arguments);
        current = callee.expression;
    }
    return chain;
}

type FunctionLike = TypeScript.SignatureDeclaration & { body?: TypeScript.Node };

function resolveFunction(
    ts: TypeScriptApi,
    sourceFile: TypeScript.SourceFile,
    argument: TypeScript.Expression | undefined,
): FunctionLike | undefined {
    if (!argument) return;
    if (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument)) return argument;
    if (ts.isIdentifier(argument)) return findTopLevelFunction(ts, sourceFile, argument.text);
}

function findTopLevelFunction(
    ts: TypeScriptApi,
    sourceFile: TypeScript.SourceFile,
    name: string,
): FunctionLike | undefined {
    for (const statement of sourceFile.statements) {
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
            const init = declaration.initializer;
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name || !init)
                continue;
            if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) return init;
        }
    }
}

function bindContextName(
    ts: TypeScriptApi,
    name: TypeScript.BindingName,
    contextNames: Set<string>,
    methodAliases: Map<string, string>,
): void {
    if (ts.isIdentifier(name)) {
        contextNames.add(name.text);
        return;
    }
    if (!ts.isObjectBindingPattern(name)) return;
    for (const element of name.elements) {
        if (!ts.isIdentifier(element.name)) continue;
        const property = element.propertyName;
        const method = property && ts.isIdentifier(property) ? property.text : element.name.text;
        methodAliases.set(element.name.text, method);
    }
}

function resolveModuleFile(base: string): string | undefined {
    const candidates = [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')];
    const stripped = base.replace(/\.js$/, '');
    if (stripped !== base) candidates.push(`${stripped}.ts`, `${stripped}.tsx`);
    return candidates.find((file) => TS_FILE.test(file) && fs.existsSync(file));
}

function listTsFiles(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        if (entry.name === 'node_modules') return [];
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return listTsFiles(full);
        return TS_FILE.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
    });
}

function fingerprint(files: string[]): string {
    return [...new Set(files)]
        .sort()
        .map((file) => `${file}:${fs.existsSync(file) ? fs.statSync(file).mtimeMs : 'missing'}`)
        .join('|');
}
