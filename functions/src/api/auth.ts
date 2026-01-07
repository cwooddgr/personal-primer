import { Request, Response } from 'express';
import * as admin from 'firebase-admin';
import { isEmailAllowed } from '../utils/firestore';

interface RegisterRequest {
  email: string;
  password: string;
}

interface ForgotPasswordRequest {
  email: string;
}

export async function handleRegister(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body as RegisterRequest;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate password length
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    // Check if email is in whitelist
    const allowed = await isEmailAllowed(email);
    if (!allowed) {
      res.status(403).json({ error: 'Email not authorized. Please contact the administrator.' });
      return;
    }

    // Create the user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
    });

    // Generate email verification link
    const verificationLink = await admin.auth().generateEmailVerificationLink(email);

    // In production, you'd send this link via email
    // For now, we'll just log it and return success
    console.log(`[Auth] Verification link for ${email}: ${verificationLink}`);

    res.json({
      success: true,
      message: 'Account created. Please check your email to verify your account.',
      userId: userRecord.uid,
    });
  } catch (error) {
    console.error('[Auth] Registration error:', error);

    if (error instanceof Error) {
      if (error.message.includes('email-already-exists')) {
        res.status(400).json({ error: 'An account with this email already exists' });
        return;
      }
      if (error.message.includes('invalid-email')) {
        res.status(400).json({ error: 'Invalid email address' });
        return;
      }
      if (error.message.includes('weak-password')) {
        res.status(400).json({ error: 'Password is too weak' });
        return;
      }
    }

    res.status(500).json({ error: 'Failed to create account' });
  }
}

export async function handleForgotPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email } = req.body as ForgotPasswordRequest;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    // Generate password reset link
    // This will throw if the user doesn't exist, but we don't want to reveal that
    try {
      const resetLink = await admin.auth().generatePasswordResetLink(email);
      console.log(`[Auth] Password reset link for ${email}: ${resetLink}`);
    } catch (e) {
      // Log but don't reveal to user
      console.log(`[Auth] Password reset requested for non-existent email: ${email}`);
    }

    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If an account with this email exists, a password reset link has been sent.',
    });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
}

export async function handleResendVerification(
  req: Request,
  res: Response,
  userId: string,
  email: string
): Promise<void> {
  try {
    // Check if already verified
    const user = await admin.auth().getUser(userId);
    if (user.emailVerified) {
      res.json({ success: true, message: 'Email is already verified' });
      return;
    }

    // Generate new verification link
    const verificationLink = await admin.auth().generateEmailVerificationLink(email);
    console.log(`[Auth] Resent verification link for ${email}: ${verificationLink}`);

    res.json({
      success: true,
      message: 'Verification email sent. Please check your inbox.',
    });
  } catch (error) {
    console.error('[Auth] Resend verification error:', error);
    res.status(500).json({ error: 'Failed to send verification email' });
  }
}
