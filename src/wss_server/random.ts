export function random(min = 0, max = 9) {
  const rand = Math.floor(Math.random() * (max - min) + min);
  return rand;
}
