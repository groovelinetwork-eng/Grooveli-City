import { expect, type Page } from '@playwright/test';

export async function signInAs(page: Page, persona: 'candidate' | 'org-admin' | 'hr-manager' | 'recruiter' | 'payroll-officer' | 'employee') {
  await page.goto('/login?switch=1');
  await page.getByTestId(`persona-${persona}`).click();
  await page.waitForURL((u) => /\/(app|org)/.test(u.pathname));
}

/** City may run with WebGL (canvas) or fall back to the directory — both are valid. */
export async function cityReady(page: Page): Promise<'3d' | 'directory'> {
  const hud = page.getByRole('region', { name: 'City controls' });
  const dir = page.getByRole('heading', { name: /directory view/i });
  await expect(hud.or(dir)).toBeVisible({ timeout: 30_000 });
  return (await dir.isVisible()) ? 'directory' : '3d';
}

export async function resetDemo(page: Page) {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.context().clearCookies();
}
