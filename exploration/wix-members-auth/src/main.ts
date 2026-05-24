import {
    initWixClient,
    loginMember,
    registerMember,
    logoutMember,
    verifyEmail,
    sendPasswordReset,
    getCurrentTokens,
    isLoggedIn,
    clearStoredTokens,
} from './wix-client';

// Intercept console.log to show in the UI log panel
const logEl = document.getElementById('log')!;
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);

function appendLog(prefix: string, ...args: unknown[]) {
    const time = new Date().toLocaleTimeString();
    const msg = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ');
    logEl.textContent += `[${time}] ${prefix} ${msg}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

console.log = (...args) => {
    origLog(...args);
    appendLog('', ...args);
};
console.warn = (...args) => {
    origWarn(...args);
    appendLog('WARN:', ...args);
};
console.error = (...args) => {
    origError(...args);
    appendLog('ERROR:', ...args);
};

// UI helpers
function setStatus(state: 'loading' | 'online' | 'offline', text: string) {
    const dot = document.getElementById('status-dot')!;
    const statusText = document.getElementById('status-text')!;
    const logoutBtn = document.getElementById('logout-btn')! as HTMLButtonElement;

    dot.className = `status-dot ${state}`;
    statusText.textContent = text;
    logoutBtn.style.display = state === 'online' ? 'inline-block' : 'none';
}

function showResult(id: string, type: 'error' | 'success' | 'info', message: string) {
    const el = document.getElementById(id)!;
    el.className = `result ${type}`;
    el.textContent = message;
    el.style.display = 'block';
}

function updateAuthStatus() {
    const tokens = getCurrentTokens();
    const loggedIn = isLoggedIn();

    if (loggedIn) {
        setStatus('online', `Logged in (member)`);
    } else {
        setStatus('offline', `Visitor (not logged in)`);
    }

    document.getElementById('member-info')!.textContent = loggedIn
        ? `role: ${tokens?.refreshToken?.role}`
        : '';
}

// Expose to window for inline onclick handlers
(window as any).refreshTokenDisplay = function refreshTokenDisplay() {
    const tokens = getCurrentTokens();
    const el = document.getElementById('token-info')!;

    if (!tokens) {
        el.textContent = 'No tokens available';
        return;
    }

    const info = {
        accessToken: {
            value: tokens.accessToken?.value?.substring(0, 40) + '...',
            expiresAt: tokens.accessToken?.expiresAt
                ? new Date(tokens.accessToken.expiresAt * 1000).toLocaleString()
                : 'N/A',
        },
        refreshToken: {
            role: (tokens.refreshToken as any)?.role ?? 'unknown',
            value: tokens.refreshToken?.value?.substring(0, 40) + '...',
        },
    };

    el.textContent = JSON.stringify(info, null, 2);
};

(window as any).handleLogin = async function handleLogin(e: Event) {
    e.preventDefault();
    const email = (document.getElementById('login-email') as HTMLInputElement).value;
    const password = (document.getElementById('login-password') as HTMLInputElement).value;
    const submitBtn = document.getElementById('login-submit') as HTMLButtonElement;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
        const result = await loginMember(email, password);

        if (result.loginState === 'SUCCESS') {
            showResult('login-result', 'success', 'Login successful!');
            updateAuthStatus();
            (window as any).refreshTokenDisplay();
        } else if (result.loginState === 'FAILURE') {
            const errorCode = (result as any).errorCode ?? 'unknown';
            const errorMsg = (result as any).error ?? 'Login failed';
            showResult('login-result', 'error', `${errorCode}: ${errorMsg}`);
        } else {
            showResult('login-result', 'info', `State: ${result.loginState} — see log for details`);
        }
    } catch (err: any) {
        console.error('Login exception:', err);
        showResult('login-result', 'error', `Exception: ${err.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
    }
};

(window as any).handleRegister = async function handleRegister(e: Event) {
    e.preventDefault();
    const email = (document.getElementById('reg-email') as HTMLInputElement).value;
    const password = (document.getElementById('reg-password') as HTMLInputElement).value;
    const firstName = (document.getElementById('reg-first') as HTMLInputElement).value || undefined;
    const lastName = (document.getElementById('reg-last') as HTMLInputElement).value || undefined;
    const submitBtn = document.getElementById('reg-submit') as HTMLButtonElement;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';

    try {
        const profile = firstName || lastName ? { firstName, lastName } : undefined;
        const result = await registerMember(email, password, profile);

        if (result.loginState === 'SUCCESS') {
            showResult('register-result', 'success', 'Registration successful — logged in!');
            updateAuthStatus();
            (window as any).refreshTokenDisplay();
        } else if (result.loginState === 'OWNER_APPROVAL_REQUIRED') {
            showResult(
                'register-result',
                'info',
                'Registration submitted — pending admin approval.',
            );
        } else if (result.loginState === 'EMAIL_VERIFICATION_REQUIRED') {
            showResult(
                'register-result',
                'info',
                'Please check your email to verify your account.',
            );
            document.getElementById('verify-section')!.style.display = 'block';
        } else if (result.loginState === 'FAILURE') {
            const errorCode = (result as any).errorCode ?? 'unknown';
            const errorMsg = (result as any).error ?? 'Registration failed';
            showResult('register-result', 'error', `${errorCode}: ${errorMsg}`);
        } else {
            showResult(
                'register-result',
                'info',
                `State: ${result.loginState} — see log for details`,
            );
        }
    } catch (err: any) {
        console.error('Register exception:', err);
        showResult('register-result', 'error', `Exception: ${err.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
    }
};

(window as any).handleLogout = async function handleLogout() {
    try {
        await logoutMember();
        showResult('login-result', 'info', 'Logged out');
        updateAuthStatus();
        (window as any).refreshTokenDisplay();
    } catch (err: any) {
        console.error('Logout exception:', err);
    }
};

(window as any).handleVerify = async function handleVerify(e: Event) {
    e.preventDefault();
    const code = (document.getElementById('verify-code') as HTMLInputElement).value;
    const submitBtn = document.getElementById('verify-submit') as HTMLButtonElement;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Verifying...';

    try {
        const result = await verifyEmail(code);

        if (result.loginState === 'SUCCESS') {
            showResult('verify-result', 'success', 'Email verified — logged in!');
            document.getElementById('verify-section')!.style.display = 'none';
            updateAuthStatus();
            (window as any).refreshTokenDisplay();
        } else if (result.loginState === 'FAILURE') {
            const errorCode = (result as any).errorCode ?? 'unknown';
            const errorMsg = (result as any).error ?? 'Verification failed';
            showResult('verify-result', 'error', `${errorCode}: ${errorMsg}`);
        } else {
            showResult('verify-result', 'info', `State: ${result.loginState} — see log`);
        }
    } catch (err: any) {
        console.error('Verify exception:', err);
        showResult('verify-result', 'error', `Exception: ${err.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Verify';
    }
};

(window as any).handlePasswordReset = async function handlePasswordReset(e: Event) {
    e.preventDefault();
    const email = (document.getElementById('reset-email') as HTMLInputElement).value;
    const submitBtn = document.getElementById('reset-submit') as HTMLButtonElement;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending...';

    try {
        await sendPasswordReset(email);
        showResult('reset-result', 'success', 'Password reset email sent — check your inbox.');
    } catch (err: any) {
        console.error('Password reset exception:', err);
        showResult('reset-result', 'error', `Exception: ${err.message}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Reset Email';
    }
};

(window as any).handleClearTokens = function handleClearTokens() {
    clearStoredTokens();
    console.log('Tokens cleared from localStorage — reload to reinitialize');
    (window as any).refreshTokenDisplay();
};

// Initialize
async function init() {
    try {
        await initWixClient();
        updateAuthStatus();
        (window as any).refreshTokenDisplay();

        // Log what auth methods are available
        const { getClient } = await import('./wix-client');
        const c = getClient();
        console.log(
            'client.auth methods:',
            Object.keys(c.auth).filter((k) => typeof (c.auth as any)[k] === 'function'),
        );
        console.log('client.auth.loggedIn():', c.auth.loggedIn());

        // Check if captcha keys are available
        const auth = c.auth as any;
        if (auth.captchaInvisibleSiteKey) {
            console.log('Invisible CAPTCHA site key:', auth.captchaInvisibleSiteKey);
        }
        if (auth.captchaVisibleSiteKey) {
            console.log('Visible CAPTCHA site key:', auth.captchaVisibleSiteKey);
        }
    } catch (err: any) {
        console.error('Init failed:', err);
        setStatus('offline', `Init failed: ${err.message}`);
    }
}

init();
