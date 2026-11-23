export function resetPassword(members, email: string) {
    return members.sendPasswordReset(email);
}
