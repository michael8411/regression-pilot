import clsx, { type ClassValue } from "clsx";

/**
 * Merge class names. Thin wrapper around clsx so we have one stable
 * helper name across the app. If Tailwind class collisions become a
 * problem later, we can swap this for `tailwind-merge` without
 * touching callers.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
