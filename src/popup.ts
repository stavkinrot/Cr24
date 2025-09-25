import { generateZip } from './generator/index';

function $(id: string) {
  return document.getElementById(id)!;
}

function parseMatches(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Theme = 'light' | 'dark';

function getStoredTheme(): Theme | null {
  const v = localStorage.getItem('theme');
  return v === 'light' || v === 'dark' ? (v as Theme) : null;
}

function getPreferredTheme(): Theme {
  return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

document.addEventListener('DOMContentLoaded', () => {
  const form = $('gen-form') as HTMLFormElement;
  const btn = $('generateBtn') as HTMLButtonElement;
  const themeToggle = $('themeToggle') as HTMLButtonElement;

  const initial = getStoredTheme() || getPreferredTheme();
  applyTheme(initial);
  themeToggle.textContent = initial === 'light' ? 'Dark mode' : 'Light mode';
  themeToggle.addEventListener('click', () => {
    const current = (document.documentElement.getAttribute('data-theme') as Theme) || 'dark';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    localStorage.setItem('theme', next);
    themeToggle.textContent = next === 'light' ? 'Dark mode' : 'Light mode';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = ( $('name') as HTMLInputElement ).value.trim();
    const description = ( $('description') as HTMLTextAreaElement ).value.trim();
    const version = ( $('version') as HTMLInputElement ).value.trim();
    const author = ( $('author') as HTMLInputElement ).value.trim();
    const yearInput = ( $('year') as HTMLInputElement ).value.trim();
    const year = yearInput || String(new Date().getFullYear());

    const featPopup = ( $('feat-popup') as HTMLInputElement ).checked;
    const featBg = ( $('feat-bg') as HTMLInputElement ).checked;
    const featCs = ( $('feat-cs') as HTMLInputElement ).checked;
    const featOptions = ( $('feat-options') as HTMLInputElement ).checked;
    const featSidePanel = ( $('feat-sidepanel') as HTMLInputElement ).checked;

    const matches = parseMatches( ( $('matches') as HTMLTextAreaElement ).value );
    const prompt = ( $('prompt') as HTMLTextAreaElement ).value.trim();

    if (!name) {
      alert('Name is required');
      return;
    }
    if (!/^\d+\.\d+\.\d+(-[\w.-]+)?$/.test(version)) {
      alert('Version must be semver, e.g. 0.1.0');
      return;
    }
    if (featCs && matches.length === 0) {
      alert('Provide at least one match pattern for the content script.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
      await generateZip({
        name,
        description,
        version,
        author,
        year,
        features: {
          popup: featPopup,
          background: featBg,
          contentScript: featCs,
          optionsPage: featOptions,
          sidePanel: featSidePanel,
        },
        matches,
        prompt,
      });
    } catch (err) {
      console.error(err);
      alert('Failed to generate ZIP. See console for details.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate ZIP';
    }
  });
});