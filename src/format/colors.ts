const enabled = process.stdout.isTTY === true && !("NO_COLOR" in process.env);

function wrap(code: number, resetCode: number) {
  if (!enabled) return (s: string) => s;
  return (s: string) => `\x1b[${code}m${s}\x1b[${resetCode}m`;
}

export const bold = wrap(1, 22);
export const dim = wrap(2, 22);
export const red = wrap(31, 39);
export const green = wrap(32, 39);
export const yellow = wrap(33, 39);
export const cyan = wrap(36, 39);
export const gray = wrap(90, 39);
