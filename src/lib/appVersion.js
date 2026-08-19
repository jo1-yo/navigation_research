/**
 * Stamped onto every trial row so batches collected under different presentations
 * stay distinguishable in analysis.
 *
 * "2d" was the original flat layout, where closer/farther was conveyed by moving a
 * div up and down the screen. "3d-ar-1" was the camera-backed perspective scene,
 * device-locked (the array followed the camera). "3d-ar-2" anchors the array to the
 * block's real-world target bearing and adds the AR alignment arrows. Bump this
 * whenever a change could plausibly move accuracy or reaction times.
 */
export const APP_VERSION = '3d-ar-2';
