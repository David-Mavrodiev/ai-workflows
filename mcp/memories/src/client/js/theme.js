import { getSettings, updateSettings } from './api.js';

let currentTheme = 'light';

export function getCurrentTheme() {
  return currentTheme;
}

export function applyTheme(theme) {
  currentTheme = theme;
  document.documentElement.setAttribute('data-theme', theme);
  const lightIcon = document.getElementById('theme-icon-light');
  const darkIcon = document.getElementById('theme-icon-dark');
  if (lightIcon && darkIcon) {
    lightIcon.classList.toggle('hidden', theme === 'dark');
    darkIcon.classList.toggle('hidden', theme === 'light');
  }
}

export async function toggleTheme() {
  const next = currentTheme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try {
    await updateSettings({ theme: next });
  } catch (e) {
    console.error('Failed to save theme:', e);
  }
}

export async function initTheme() {
  try {
    const settings = await getSettings();
    applyTheme(settings.theme || 'light');
  } catch (e) {
    applyTheme('light');
  }
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
}
