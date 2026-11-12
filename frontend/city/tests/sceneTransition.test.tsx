import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../src/scene/CityCanvas', async () => ({ default: (await import('./canvasStub')).CanvasStub }));

import { App } from '../src/app/App';
import { enterInfo, leaveInfo } from '../src/app/sceneTransition';

describe('door transition content', () => {
  it('uses the company brand for headquarters and fixed identities for the apartment and AI Center', () => {
    const hq = enterInfo('Kestrel Systems HQ', 'hq', { name: 'Kestrel Systems', logoColor: '#0ea5e9' });
    expect(hq).toMatchObject({ direction: 'enter', title: 'Kestrel Systems', subtitle: 'Company headquarters', accent: '#0ea5e9', badge: 'KS' });
    expect(enterInfo('Northwind HQ', 'hq', null)).toMatchObject({ title: 'Northwind HQ', badge: 'NO' });
    expect(enterInfo('Home', 'apartment').title).toBe('Your apartment');
    expect(enterInfo('AI', 'ai-center').title).toBe('AI Career Center');
    expect(leaveInfo('Technology Hub')).toMatchObject({ direction: 'leave', title: 'Back to the street', subtitle: 'Technology Hub' });
  });
});

describe('entering and leaving a building', () => {
  const phase = () => screen.queryByTestId('scene-transition')?.getAttribute('data-phase') ?? null;

  it('closes the doors, builds the room behind them, opens once the scene is drawn and ignores keys meanwhile', async () => {
    localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ reducedMotion: false }));
    render(<App search="?org=kestrel-systems" webgl />);
    await screen.findByTestId('canvas-stub');
    const panel = screen.getByRole('dialog', { name: 'Kestrel Systems HQ' });
    await userEvent.click(within(panel).getByRole('button', { name: /Enter headquarters/ }));

    // doors shut immediately over the street; the street is still mounted underneath
    expect(phase()).toBe('closing');
    const tx = screen.getByTestId('scene-transition');
    expect(tx).toHaveAttribute('aria-hidden', 'true');
    expect(within(tx).getByText('Kestrel Systems')).toBeInTheDocument();
    expect(within(tx).getByText('Entering')).toBeInTheDocument();
    expect(screen.getByTestId('canvas-stub')).toHaveAttribute('data-scene', 'street');
    // Escape while the doors are shut does nothing
    fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });

    // the interior is swapped in behind the doors, then the doors open and go away
    await waitFor(() => expect(screen.getByTestId('canvas-stub')).toHaveAttribute('data-scene', 'hq'));
    await waitFor(() => expect(phase()).toBe('opening'));
    expect(screen.getByText(/Inside Kestrel Systems HQ/)).toBeInTheDocument();
    await waitFor(() => expect(phase()).toBeNull(), { timeout: 2000 });

    // leaving uses the same doors
    fireEvent.keyDown(window, { code: 'Escape', key: 'Escape' });
    expect(phase()).toBe('closing');
    expect(within(screen.getByTestId('scene-transition')).getByText('Back to the street')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('canvas-stub')).toHaveAttribute('data-scene', 'street'));
    await waitFor(() => expect(phase()).toBeNull(), { timeout: 2000 });
    expect(screen.queryByText(/Inside Kestrel Systems HQ/)).toBeNull();
    localStorage.removeItem('grooveli.city-settings.v1');
  });

  it('skips the sliding doors with reduced motion', async () => {
    localStorage.setItem('grooveli.city-settings.v1', JSON.stringify({ reducedMotion: true }));
    render(<App search="?org=kestrel-systems" webgl />);
    await screen.findByTestId('canvas-stub');
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Kestrel Systems HQ' })).getByRole('button', { name: /Enter headquarters/ }));
    expect(phase()).toBe('loading');
    expect(screen.getByTestId('scene-transition')).toHaveClass('tx-reduced');
    await waitFor(() => expect(phase()).toBeNull());
    expect(screen.getByText(/Inside Kestrel Systems HQ/)).toBeInTheDocument();
    localStorage.removeItem('grooveli.city-settings.v1');
  });
});
