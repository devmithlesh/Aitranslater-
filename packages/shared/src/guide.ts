/**
 * Facts the how-to guide, the popup and the extension manifest all state. They live here once, so
 * changing one (a shortcut, the tutorial video) changes the guide and the popup on the next build/deploy.
 * A test in apps/extension compares these with public/manifest.json, so the two cannot drift apart.
 */

/** Keyboard shortcuts Verba suggests to Chrome. People may change them at chrome://extensions/shortcuts. */
export const DEFAULT_SHORTCUTS = {
  /** Opens the Verba popup (Chrome's built-in "_execute_action" command). */
  openPopup: 'Alt+Shift+V',
  /** Translates the text typed in the focused box and puts the result back, without opening the popup. */
  translateInPlace: 'Alt+Shift+E',
} as const;

/** Name of the command in manifest.json that translates in place. */
export const TRANSLATE_IN_PLACE_COMMAND = 'translate-in-place';

/** The tutorial video on YouTube (the part after /embed/). */
export const GUIDE_VIDEO_ID = '0VDY3DHfURM';

/** Path of the public how-to page on the website. */
export const GUIDE_PATH = '/guide';
