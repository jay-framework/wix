export function remember(password: string) {
    localStorage.setItem('password', password);
    sessionStorage.setItem('userPassword', password);
    localStorage.setItem('theme', 'dark');
}
