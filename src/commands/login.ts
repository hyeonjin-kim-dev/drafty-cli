import { requestOtp, verifyOtpCode } from '../lib/auth.js';
import { DraftyError } from '../lib/errors.js';
import { prompt } from '../lib/prompt.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

export async function loginCommand(): Promise<void> {
    const email = await prompt('Email: ');

    if (!EMAIL_PATTERN.test(email)) {
        throw new DraftyError('Enter a valid email address.');
    }

    await requestOtp(email);
    console.log(`Sign-in code sent to ${email}.`);
    console.log(
        'Enter the 6-digit code from the email in this terminal. Do not open a browser link.',
    );
    console.log(
        'If the email only contains a link, update your Supabase Email Templates to use a token-based OTP email.',
    );

    const otp = await prompt('Email code: ');

    if (!otp) {
        throw new DraftyError('Email code is required.');
    }

    const session = await verifyOtpCode(email, otp);
    console.log(`Logged in as ${session.email}.`);
}
