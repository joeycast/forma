import type { Accent } from './document';
export const accents: Record<Accent, { ink: string; fill: string; border: string; dark: string }> =
  {
    slate: { ink: '#53647b', fill: '#f0f3f7', border: '#dce2ea', dark: '#9aaabe' },
    blue: { ink: '#456bcb', fill: '#edf2fe', border: '#cedbfa', dark: '#92b0fc' },
    teal: { ink: '#218779', fill: '#eaf6f2', border: '#c4e5dc', dark: '#7dd5c2' },
    amber: { ink: '#a47524', fill: '#fbf5e8', border: '#ecdfbb', dark: '#e5c47e' },
    violet: { ink: '#8061b2', fill: '#f3eefa', border: '#e0d3f1', dark: '#c6a6f2' },
  };
export const themes = {
  paper: {
    background: '#ffffff',
    text: '#25344b',
    secondary: '#778297',
    line: '#93a1b5',
    border: '#dce2ea',
    card: '#ffffff',
    group: '#f8fafc',
    shadow: '#172b4d',
    muted: '#f4f6f9',
  },
  midnight: {
    background: '#171e2b',
    text: '#e6edf8',
    secondary: '#9eacc1',
    line: '#8191aa',
    border: '#374255',
    card: '#222d3e',
    group: '#1b2534',
    shadow: '#000000',
    muted: '#1e2838',
  },
};
