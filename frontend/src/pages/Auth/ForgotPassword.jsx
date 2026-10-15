import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axiosInstance from '../../utils/axiosInstance';
import { API_PATHS } from '../../utils/apiPaths';

export default function ForgotPassword() {
    const [step, setStep] = useState('email');
    const [email, setEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [remaining, setRemaining] = useState(0);
    const lock = useRef(false);
    const alive = useRef(true);
    useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
    useEffect(() => {
        if (!remaining) return;
        const timer = setTimeout(() => setRemaining(value => Math.max(0, value - 1)), 1000);
        return () => clearTimeout(timer);
    }, [remaining]);

    const submit = async (event, resend = false) => {
        event.preventDefault();
        if (lock.current) return;
        const sending = step === 'email' || resend;
        if (sending && remaining) return;
        if (!sending && (!/^\d{6}$/.test(otp) || newPassword.length < 8 || newPassword.length > 128 || new TextEncoder().encode(newPassword).length > 72 || newPassword !== confirmPassword)) {
            setError('Enter a 6-digit code and matching passwords of 8–128 characters, up to 72 UTF-8 bytes.');
            return;
        }
        lock.current = true; setPending(true); setError(''); setMessage('');
        try {
            const response = await axiosInstance.post(sending ? API_PATHS.AUTH.REQUEST_PASSWORD_RESET : API_PATHS.AUTH.RESET_PASSWORD,
                sending ? { email: email.trim() } : { email: email.trim(), otp, newPassword, confirmPassword });
            if (!alive.current) return;
            setMessage(response.data.message);
            setOtp(''); setNewPassword(''); setConfirmPassword('');
            if (sending) { setStep('reset'); setRemaining(response.data.retryAfter || 60); }
            else { setStep('done'); }
        } catch (failure) {
            if (!alive.current) return;
            const data = failure.response?.data;
            const text = Array.isArray(data?.message) ? data.message.join(' ') : data?.message;
            setError(text || (sending ? 'Request could not be confirmed. Wait a minute, check your email, then try again.' : 'Reset could not be confirmed. Try signing in with the new password; otherwise request a new code.'));
            if (data?.retryAfter) setRemaining(data.retryAfter);
        } finally { lock.current = false; if (alive.current) setPending(false); }
    };
    const restart = () => {
        setStep('email'); setOtp(''); setNewPassword(''); setConfirmPassword(''); setError(''); setMessage('');
    };
    const inputClass = 'w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900';
    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-lg shadow-md">
                <h1 className="text-2xl font-bold text-gray-800">{step === 'email' ? 'Forgot Password' : step === 'reset' ? 'Reset Password' : 'Password Reset Complete'}</h1>
                <p className="text-sm text-gray-600">{step === 'email' ? 'Request a reset code. Reloading this page starts a new request.' : step === 'reset' ? 'Enter the code from your email and a new password. The server checks the code when you submit.' : 'Sign in with your new password.'}</p>
                {message && <p role="status" className="text-sm text-green-700">{message}</p>}
                {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
                {step !== 'done' && <form onSubmit={submit} className="space-y-4">
                    <label className="block text-gray-700" htmlFor="reset-email">Email Address</label>
                    <input id="reset-email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} disabled={pending || step === 'reset'} className={inputClass} />
                    {step === 'reset' && <>
                        <label className="block text-gray-700" htmlFor="reset-code">Reset Code</label>
                        <input id="reset-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={event => setOtp(event.target.value)} disabled={pending} className={inputClass} />
                        <label className="block text-gray-700" htmlFor="reset-password">New Password</label>
                        <input id="reset-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={newPassword} onChange={event => setNewPassword(event.target.value)} disabled={pending} className={inputClass} />
                        <label className="block text-gray-700" htmlFor="reset-confirm">Confirm Password</label>
                        <input id="reset-confirm" type="password" autoComplete="new-password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} disabled={pending} className={inputClass} />
                    </>}
                    <button type="submit" disabled={pending || (step === 'email' && remaining > 0)} className="w-full px-4 py-2 text-white bg-blue-600 rounded-md disabled:opacity-50">{pending ? 'Please wait…' : step === 'email' ? 'Request Reset Code' : 'Reset Password'}</button>
                </form>}
                {step === 'reset' && <div className="flex justify-between gap-4">
                    <button type="button" disabled={pending || remaining > 0} onClick={event => submit(event, true)} className="text-blue-700 disabled:opacity-50">{remaining ? `Resend in ${remaining}s` : 'Resend Code'}</button>
                    <button type="button" disabled={pending} onClick={restart} className="text-blue-700">Start Again</button>
                </div>}
                <Link to="/login" className="text-sm text-blue-700 underline">Back to Login</Link>
            </div>
        </div>
    );
}
