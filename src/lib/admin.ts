import { auth } from './firebase';

/**
 * Normalizes a display name to verify if a user matches 'abdelwahab_ahmed' (with underscores or spaces).
 */
export function isAbdelwahabAhmed(displayName?: string, email?: string): boolean {
  const name = (displayName || '').toLowerCase().trim().replace(/[\s_]+/g, '_');
  const mail = (email || '').toLowerCase().trim();
  
  return (
    name === 'abdelwahab_ahmed' ||
    mail.includes('616264656c77616861625f61686d6564') || // hex ascii of 'abdelwahab_ahmed'
    mail.includes('616264656c77616861622061686d6564')    // hex ascii of 'abdelwahab ahmed'
  );
}

/**
 * Checks if a user has admin privileges.
 */
export function isAdmin(email?: string, displayName?: string): boolean {
  const mail = (email || '').toLowerCase().trim();
  
  if (mail === 'mrahmedapp4@gmail.com' || mail === 'admin@user.familyfantasy.com') {
    return true;
  }
  
  return isAbdelwahabAhmed(displayName, email);
}

/**
 * Determines whether a user is allowed to make predictions.
 * Abdelwahab Ahmed can predict; other admins cannot.
 */
export function canPredict(email?: string, displayName?: string): boolean {
  const mail = (email || '').toLowerCase().trim();
  
  // Standard non-predicting admins
  if (mail === 'mrahmedapp4@gmail.com' || mail === 'admin@user.familyfantasy.com') {
    return false;
  }
  
  return true;
}
