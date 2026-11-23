import type * as TypeScript from 'typescript';

export type TypeScriptApi = typeof TypeScript;

export class TypeScriptMissingError extends Error {
    constructor(cause: unknown) {
        super(`typescript could not be loaded: ${(cause as Error)?.message ?? cause}`);
    }
}

/**
 * `typescript` is an optional peer dependency (Design Log #63, decision 6): load it lazily so
 * a project without it still runs the rest of `jay-stack validate`.
 */
export async function loadTypeScript(): Promise<TypeScriptApi> {
    try {
        const loaded: any = await import('typescript');
        return (loaded.default ?? loaded) as TypeScriptApi;
    } catch (error) {
        throw new TypeScriptMissingError(error);
    }
}
