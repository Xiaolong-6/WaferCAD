// Versioned desktop-only preferences. No project/History/Recovery serialization.
import { createDesktopLayout, normalizeDesktopLayout } from './view-layout-model.js';

export const DESKTOP_LAYOUT_STORAGE_KEY = 'wafercad.desktop-view-layout.v1';
export const DESKTOP_LAYOUT_STORAGE_VERSION = 1;

export function loadDesktopLayout(storage) {
  try {
    const raw = storage?.getItem(DESKTOP_LAYOUT_STORAGE_KEY);
    if (!raw) return createDesktopLayout();
    const envelope = JSON.parse(raw);
    if (envelope?.version !== DESKTOP_LAYOUT_STORAGE_VERSION || !envelope.layout)
      return createDesktopLayout();
    return normalizeDesktopLayout(envelope.layout);
  } catch {
    return createDesktopLayout();
  }
}
export function saveDesktopLayout(storage, state) {
  try {
    if (!storage?.setItem) return false;
    const layout = normalizeDesktopLayout(state);
    storage.setItem(DESKTOP_LAYOUT_STORAGE_KEY, JSON.stringify({
      version: DESKTOP_LAYOUT_STORAGE_VERSION,
      layout: {
        visible: layout.visible,
        order: layout.order,
        preset: layout.preset,
        remembered: layout.remembered,
        tracks: layout.tracks,
        // Never persist transient maximization or active pointer drag.
      },
    }));
    return true;
  } catch {
    return false;
  }
}
