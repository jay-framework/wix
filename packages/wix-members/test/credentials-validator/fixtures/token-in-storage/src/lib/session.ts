export function keep(value: string) {
    localStorage.setItem('accessToken', value);
    window.localStorage.setItem('api_access_key', value);
}
