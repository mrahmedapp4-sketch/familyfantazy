import { auth } from './firebase';

/**
 * Checks if a user has admin/host privileges.
 */
export function isAdmin(email?: string, displayName?: string): boolean {
  const mail = (email || '').toLowerCase().trim();
  return mail === 'mrahmedapp4@gmail.com' || mail === 'admin@user.familyfantasy.com';
}

/**
 * Determines whether a user is allowed to make predictions.
 * Admins/hosts are not allowed to make predictions.
 */
export function canPredict(email?: string, displayName?: string): boolean {
  if (isAdmin(email, displayName)) {
    return false;
  }
  return true;
}
