import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// jsdom has no WebGL: replace the R3F canvas with a stub so the DOM HUD can be tested.
vi.mock('../src/scene/CityCanvas', () => ({ default: () => <div data-testid="canvas-stub" /> }));

import { App } from '../src/app/App';
import { canUseWebGL } from '../src/app/webgl';

describe('non-WebGL fallback', () => {
  it('detects missing WebGL in jsdom', () => {
    expect(canUseWebGL()).toBe(false);
  });

  it('renders the accessible directory with the same web links', async () => {
    render(<App search="" webgl={false} />);
    expect(screen.getByRole('heading', { name: /directory view/i })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/WebGL is not available/);
    await userEvent.click(screen.getByRole('button', { name: 'Technology Hub' }));
    const panel = screen.getByRole('dialog', { name: 'Technology Hub' });
    const link = within(panel).getByRole('link', { name: /Explore jobs/ });
    const url = new URL(link.getAttribute('href')!);
    expect(url.pathname).toBe('/opportunities');
    expect(url.searchParams.get('district')).toBe('tech');
    expect(url.searchParams.get('from')).toBe('city');
  });

  it('lets users enter a building and reach interior stations without 3D', async () => {
    render(<App search="?district=tech" webgl={false} />);
    await userEvent.click(screen.getByRole('button', { name: /Kestrel Systems HQ/ }));
    await userEvent.click(screen.getByRole('button', { name: /Employee entrance/ }));
    const link = screen.getByRole('link', { name: /Open employee workspace/ });
    expect(new URL(link.getAttribute('href')!).pathname).toBe('/org/me');
  });

  it('honours ?renderer=2d even when WebGL works', () => {
    render(<App search="?renderer=2d" webgl />);
    expect(screen.getByRole('status')).toHaveTextContent(/Directory view/);
    expect(screen.getByRole('button', { name: /Try the 3D city/ })).toBeInTheDocument();
  });
});

describe('3D city HUD (canvas stubbed)', () => {
  it('shows identity, simulated presence and keyboard help', async () => {
    render(<App search="" webgl />);
    expect(await screen.findByTestId('canvas-stub')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Guest.*Open Grooveli web/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /simulated people nearby/ })).toBeInTheDocument();
    expect(screen.getByText(/Street|Grooveli Plaza/, { selector: '.hud-location span' })).toBeInTheDocument();
  });

  it('opens Places with P, travels, and closes panels with Esc', async () => {
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    act(() => {
      fireEvent.keyDown(window, { code: 'KeyP', key: 'p' });
    });
    expect(screen.getByRole('dialog', { name: 'Places' })).toBeInTheDocument();
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Places' })).getByRole('button', { name: /Finance District/ }));
    expect(screen.getByRole('dialog', { name: 'Finance District' })).toBeInTheDocument();
    expect(screen.getByText('Finance District', { selector: '.hud-location span' })).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('deep-links to a company HQ and enters it', async () => {
    render(<App search="?org=kestrel-systems" webgl />);
    await screen.findByTestId('canvas-stub');
    const panel = screen.getByRole('dialog', { name: 'Kestrel Systems HQ' });
    await userEvent.click(within(panel).getByRole('button', { name: /Enter headquarters/ }));
    expect(screen.getByText(/Inside Kestrel Systems HQ/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Careers board/ }));
    const careers = screen.getByRole('dialog', { name: /Careers board/ });
    expect(within(careers).getAllByRole('link').some((a) => a.getAttribute('href')!.includes('/opportunities/job-k-'))).toBe(true);
    act(() => {
      fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
    });
    // simulated people are labelled as such
    expect(screen.getByText(/people simulated/i)).toBeInTheDocument();
    // HR: links grouped by audience, all routed to the access-checked /org workspace
    await userEvent.click(screen.getByRole('button', { name: 'HR & employee services' }));
    const hr = screen.getByRole('dialog', { name: /HR & employee services/ });
    expect(within(hr).getByRole('region', { name: 'Employees' })).toBeInTheDocument();
    const hrefs = within(hr).getAllByRole('link').map((a) => new URL(a.getAttribute('href')!));
    expect(hrefs.some((u) => u.pathname === '/org/hr/leave' && u.searchParams.get('org') === 'kestrel-systems')).toBe(true);
    expect(within(hr).getByText(/never loads private records/)).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
    });
    // reception: visitor check-in is explicitly a demo
    await userEvent.click(screen.getByRole('button', { name: 'Reception & check-in' }));
    const rec = screen.getByRole('dialog', { name: /Reception & check-in/ });
    await userEvent.click(within(rec).getByRole('button', { name: /Check in as a visitor/ }));
    expect(within(rec).getByRole('status')).toHaveTextContent(/nothing is recorded or sent/);
    act(() => {
      fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
    });
    expect(screen.queryByText(/Inside Kestrel/)).not.toBeInTheDocument();
  });

  it('switches to the directory from settings', async () => {
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: /Settings/ }));
    await userEvent.click(screen.getByRole('button', { name: /Switch to 2D directory/ }));
    expect(screen.getByRole('heading', { name: /directory view/i })).toBeInTheDocument();
  });

  it('shows the reduced-motion and quality settings', async () => {
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: /Settings/ }));
    const reduce = screen.getByRole('checkbox', { name: /Reduce motion/ });
    await userEvent.click(reduce);
    expect(JSON.parse(localStorage.getItem('grooveli.city-settings.v1')!).reducedMotion).toBe(true);
    expect(screen.getByRole('radio', { name: 'low' })).toBeInTheDocument();
  });

  it('matches the reference HUD: district pill, menu with map travel, notifications', async () => {
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    expect(document.querySelector('.hud-district')).toHaveTextContent(/Plaza/);
    await userEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    const notes = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(notes).getByText('Tech Hub Career Fair')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    const menu = screen.getByRole('dialog', { name: 'Menu' });
    // map: select a district (shows its details), then travel via the existing travel action
    await userEvent.click(within(menu).getByRole('button', { name: /^Finance District: .*Show details/ }));
    expect(within(menu).getByText(/Landmarks: Copperleaf Finance/)).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Travel to Finance District' }));
    expect(screen.getByRole('dialog', { name: 'Finance District' })).toBeInTheDocument();
  });

  it('opens the full city map from the menu and links landmarks to their building panel', async () => {
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    await userEvent.click(screen.getByRole('button', { name: 'Menu' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Open full map' }));
    const map = screen.getByRole('dialog', { name: 'City map' });
    // keyboard: focus previews a district, Enter selects
    const plaza = within(map).getByRole('button', { name: /^Grooveli Plaza: .*Show details/ });
    plaza.focus();
    expect(within(map).getByText(/Hover|Click or tap for actions/)).toBeInTheDocument();
    await userEvent.click(within(map).getByRole('button', { name: /^Kestrel Systems HQ, Technology Hub\. Show details/ }));
    await userEvent.click(within(map).getByRole('button', { name: /Details & enter/ }));
    expect(screen.getByRole('dialog', { name: 'Kestrel Systems HQ' })).toBeInTheDocument();
  });

  it('shows the XP bar only when the web app supplied real level progress', async () => {
    const bridge = { version: 1, displayName: 'Inje Williams', level: 2, avatar: { body: 1, skin: 3, hair: 0, hairColor: 0, outfit: 1, outfitColor: 0, accessory: 0 }, publicOrgUpdates: {}, updatedAt: '2026-11-09T00:00:00.000Z' };
    localStorage.setItem('grooveli.city-bridge.v1', JSON.stringify(bridge));
    const { unmount } = render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    expect(document.querySelector('.xp-bar')).toBeNull();
    unmount();
    localStorage.setItem('grooveli.city-bridge.v1', JSON.stringify({ ...bridge, levelProgress: 0.4 }));
    render(<App search="" webgl />);
    await screen.findByTestId('canvas-stub');
    expect(screen.getByRole('link', { name: /Inje Williams, career level 2, 40% to next level/ })).toBeInTheDocument();
    localStorage.removeItem('grooveli.city-bridge.v1');
  });
});
