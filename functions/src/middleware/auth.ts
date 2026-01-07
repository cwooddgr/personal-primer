import * as admin from 'firebase-admin';
import { Request } from 'firebase-functions/v2/https';

export interface AuthResult {
  userId: string;
  email: string;
}

export async function verifyAuth(req: Request): Promise<AuthResult | null> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return {
      userId: decodedToken.uid,
      email: decodedToken.email || '',
    };
  } catch (error) {
    console.error('[Auth] Token verification failed:', error);
    return null;
  }
}
