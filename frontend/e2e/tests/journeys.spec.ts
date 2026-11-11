import { expect, test } from '@playwright/test';
import { cityReady, resetDemo, signInAs } from './helpers';

test.beforeEach(async ({ page }) => {
  await resetDemo(page);
});

test('J1 candidate: register → identity/avatar → city → company job → simulated apply → track', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel(/Your name/).fill('Ada Test');
  await page.getByLabel('Email').fill('ada@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByLabel(/synthetic data/).check();
  await page.getByRole('button', { name: /Continue to profile setup/ }).click();
  await page.waitForURL('**/onboarding/candidate');

  await page.getByLabel('Professional headline').fill('Operations analyst');
  await page.getByRole('button', { name: 'Continue' }).click(); // identity → avatar
  await page.getByRole('radio', { name: 'Afro' }).check();
  await page.getByRole('button', { name: 'Continue' }).click(); // avatar → personality (optional)
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // orientation → cv
  await page.getByRole('button', { name: 'Continue' }).click(); // cv → review
  await page.getByRole('button', { name: 'Create my profile' }).click();
  await expect(page.getByRole('heading', { name: /Welcome to Grooveli, Ada/ })).toBeVisible();

  // Enter the city (same-origin /city proxy) — link carries only cosmetic avatar code.
  const cityLink = page.getByRole('link', { name: /Enter the city at your apartment/ });
  const href = (await cityLink.getAttribute('href'))!;
  expect(href).toMatch(/^\/city\/\?district=apartment&avatar=\d+(-\d+){6}$/);
  await cityLink.click();
  const mode = await cityReady(page);

  // Navigate to Tech Hub and open the canonical web job list.
  if (mode === '3d') {
    await expect(page.getByRole('link', { name: /Ada Test/ })).toBeVisible();
    await page.getByRole('button', { name: 'Places (P)' }).click();
    await page.getByRole('dialog', { name: 'Places' }).getByRole('button', { name: /Technology Hub/ }).click();
  } else {
    await page.getByRole('button', { name: 'Technology Hub' }).click();
  }
  await page.getByRole('dialog', { name: 'Technology Hub' }).getByRole('link', { name: /Explore jobs/ }).click();
  await page.waitForURL((u) => u.pathname === '/opportunities' && u.searchParams.get('from') === 'city');
  await expect(page.getByRole('region', { name: 'Return to city' })).toContainText('Technology Hub');

  await page.getByRole('link', { name: 'Backend Engineer' }).click();
  await page.getByRole('link', { name: /Check fit & apply/ }).click();
  await expect(page.getByRole('dialog', { name: /Apply: Backend Engineer/ })).toBeVisible();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: /Confirm & submit \(simulated\)/ }).click();
  await expect(page.getByRole('link', { name: /Applied · submitted/ })).toBeVisible();

  await page.goto('/app/applications');
  await expect(page.getByRole('heading', { name: 'Backend Engineer' })).toBeVisible();
  await expect(page.getByText(/Simulated/).first()).toBeVisible();
});

test('J2 employer: build organisation → publish vacancy → review applicants → HQ preview in city', async ({ page }) => {
  await signInAs(page, 'org-admin');
  await page.goto('/onboarding/organization');
  await page.getByLabel('Organisation name').fill('Nimbus Foods');
  await page.getByLabel('Industry / business category').fill('Food & beverage');
  await page.getByLabel('City district for your virtual HQ').selectOption('hospitality');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel(/Company values/).fill('Freshness, Care');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Skip' }).click(); // policies
  await page.getByRole('button', { name: 'Continue' }).click(); // locations
  await page.getByLabel('Invite by email').fill('recruiter@nimbus.example');
  await page.getByRole('button', { name: 'Add invitation' }).click();
  await page.getByRole('button', { name: 'Continue' }).click(); // team
  await page.getByRole('button', { name: 'Continue' }).click(); // departments
  await page.getByRole('checkbox', { name: 'Recruiter' }).check();
  await page.getByRole('button', { name: 'Continue' }).click(); // roles
  await page.getByRole('button', { name: 'Create organisation' }).click();
  await expect(page.getByRole('heading', { name: 'Nimbus Foods is ready' })).toBeVisible();

  await page.getByRole('link', { name: 'Publish your first vacancy' }).click();
  await page.getByLabel('Job title').fill('Pastry Chef');
  await page.getByLabel(/Skills/).first().fill('Baking, Food safety');
  await page.getByRole('button', { name: 'Publish vacancy' }).click();
  await page.waitForURL('**/org/recruitment');
  await expect(page.getByRole('link', { name: 'Pastry Chef' })).toBeVisible();

  // Public board shows the new vacancy.
  await page.goto('/opportunities?district=hospitality');
  await expect(page.getByRole('link', { name: 'Pastry Chef' })).toBeVisible();

  // Kestrel pipeline (seeded applicants) is reviewable.
  await page.goto('/org');
  await page.getByLabel('Switch organisation').selectOption('kestrel-systems');
  await expect(page.getByRole('complementary', { name: 'Kestrel Systems workspace navigation' })).toBeVisible();
  await page.goto('/org/recruitment/pipeline?job=job-k-backend');
  await expect(page.getByRole('list', { name: /Pipeline for Backend Engineer/ })).toBeVisible();

  await page.goto('/org/hq');
  const hq = page.getByRole('link', { name: /Open HQ in the city/ });
  expect(await hq.getAttribute('href')).toContain('org=kestrel-systems');
  await hq.click();
  const mode = await cityReady(page);
  if (mode === '3d') await expect(page.getByRole('dialog', { name: 'Kestrel Systems HQ' })).toBeVisible();
});

test('J3 HR manager & payroll: directory → leave → simulated payroll preview → analytics', async ({ page }) => {
  await signInAs(page, 'hr-manager');
  await expect(page.getByRole('heading', { name: 'Employee directory' })).toBeVisible();
  await page.goto('/org/hr/leave');
  const approve = page.getByRole('button', { name: 'Approve' }).first();
  await approve.click();
  await expect(page.getByText(/Decision recorded/)).toBeVisible();
  await page.goto('/org/hr/performance');
  await expect(page.getByRole('heading', { name: 'Performance & appraisals' })).toBeVisible();
  // HR manager can view but not prepare payroll.
  await page.goto('/org/payroll/run');
  await expect(page.getByRole('alert').filter({ hasText: /access/ })).toContainText(/Prepare payroll previews/);

  await signInAs(page, 'payroll-officer');
  await page.goto('/org/payroll/run');
  await expect(page.getByText(/Payroll preview only/)).toBeVisible();
  await page.getByRole('button', { name: /Prepare preview/ }).click();
  await expect(page.getByRole('table', { name: 'Payslip previews' })).toBeVisible();
  await page.getByRole('button', { name: /Approve preview/ }).click();
  await page.getByRole('button', { name: /Approve preview \(simulated\)/ }).click();
  await expect(page.getByText(/No payment instruction exists/)).toBeVisible();
  await page.goto('/org/analytics');
  await expect(page.getByRole('heading', { name: 'Workforce intelligence', exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: /Headcount by month/ })).toBeVisible();
});

test('J4 city by keyboard: move, interact, enter apartment, return to web', async ({ page }) => {
  await page.goto('/city/?district=apartment');
  const mode = await cityReady(page);
  test.skip(mode === 'directory', 'WebGL unavailable in this browser — directory covered by J6');
  await page.keyboard.press('Escape'); // close the deep-linked district panel
  const location = page.locator('.hud-location');
  await expect(location).toContainText(/Apartment/);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  // Travel to the AI Center via the menu's map (keyboard accessible) and enter.
  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('button', { name: /^AI Career Center: .*Show details/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Travel to AI Career Center' }).focus();
  await page.keyboard.press('Enter');
  const panel = page.getByRole('dialog', { name: 'AI Career Center' });
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: /AI Career Center/ }).click();
  await expect(location).toContainText(/Inside AI Career Center/);
  await page.getByRole('button', { name: /AI core — career assistant/ }).click();
  const link = page.getByRole('link', { name: /Open the career assistant/ });
  const url = new URL((await link.getAttribute('href'))!);
  expect(url.pathname).toBe('/app/career-center');
  expect(url.searchParams.get('from')).toBe('city');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(location).not.toContainText(/Inside/);
});

test('J5 social: events & communities, simulated presence clearly labelled', async ({ page }) => {
  await page.goto('/social');
  await expect(page.getByText(/Simulated community/)).toBeVisible();
  await page.getByRole('link', { name: 'Tech Hub Career Fair' }).click();
  await expect(page.getByRole('link', { name: /Sign in to take part/ }).first()).toBeVisible();
  await signInAs(page, 'candidate');
  await page.goto('/social/events/evt-tech-fair');
  await page.getByRole('button', { name: 'RSVP' }).click();
  await expect(page.getByRole('button', { name: /Going/ })).toBeVisible();
  await page.goto('/city/');
  const mode = await cityReady(page);
  if (mode === '3d') {
    await page.getByRole('button', { name: /simulated people nearby/ }).click();
    const people = page.getByRole('dialog', { name: 'People nearby' });
    await expect(people).toContainText(/Simulated presence — not live players/);
  } else {
    await expect(page.getByText(/simulated/i).first()).toBeVisible();
  }
});

test('J6 non-WebGL fallback and direct city origin', async ({ page }) => {
  await page.goto('http://localhost:3001/city/?renderer=2d&district=finance');
  await expect(page.getByRole('heading', { name: /directory view/i })).toBeVisible();
  const panel = page.getByRole('dialog', { name: 'Finance District' });
  const link = panel.getByRole('link', { name: /Explore jobs/ });
  const url = new URL((await link.getAttribute('href'))!);
  expect(url.origin).toBe('http://localhost:3000');
  expect(url.searchParams.get('district')).toBe('finance');
  // Tampered params are ignored.
  await page.goto('http://localhost:3001/city/?renderer=2d&district=javascript:alert(1)&org=../../x');
  await expect(page.getByRole('dialog', { name: 'Grooveli Plaza' })).toBeVisible();
});

test('J7 @mobile responsive web and touch city', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'mobile project only');
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await signInAs(page, 'candidate');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Find jobs' }).click();
  await expect(page.getByRole('heading', { name: 'Find jobs' })).toBeVisible();
  await page.goto('/city/');
  const mode = await cityReady(page);
  if (mode === '3d') await expect(page.getByRole('application', { name: 'Movement joystick' })).toBeVisible();
});
