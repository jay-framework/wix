export function signUp(email: string, ctx) {
    return ctx.register(email, '');
}
