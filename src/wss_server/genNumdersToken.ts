export function genNumdersToken(length = 10) {
  const base = 10 ** length;
  const token = Math.floor(base + Math.random() * 9 * base).toString(); // token
  return token;
}
