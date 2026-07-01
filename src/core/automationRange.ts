/**
 * Compute the pitch range for an automation parameter based on its own range and step,
 * rather than the parent instrument's noteRange.
 *
 * - If step is defined and produces a reasonable number of discrete values (≤256), use exact steps.
 * - Otherwise, default to 128 evenly-spaced values.
 */

const MAX_AUTOMATION_ROWS = 128;

export function getAutomationPitchRange(
  paramMin: number,
  paramMax: number,
  paramStep?: number,
): { min: number; max: number } {
  if (paramStep && paramStep > 0) {
    const numSteps = Math.round((paramMax - paramMin) / paramStep);
    if (numSteps > 0 && numSteps <= 256) {
      return { min: 0, max: numSteps };
    }
  }
  // Continuous or very fine-grained parameter: use 128 rows
  return { min: 0, max: MAX_AUTOMATION_ROWS - 1 };
}
