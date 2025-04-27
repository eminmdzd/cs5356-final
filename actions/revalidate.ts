'use server';

import { revalidatePath } from 'next/cache';

/**
 * Server action to revalidate multiple paths
 * This function is designed to be used outside of render context to avoid
 * "revalidatePath during render" errors
 */
export default async function revalidatePaths(paths: string[]) {
  for (const path of paths) {
    revalidatePath(path);
  }
  return { success: true };
}