/** Return a sorted copy using the project's ES2022 array APIs.
 * @template T
 * @param {readonly T[]} values
 * @param {(left:T,right:T)=>number} [compare]
 * @returns {T[]} */
export function sorted(values, compare) {
  const result = [...values];
  Array.prototype.sort.call(result, compare);
  return result;
}
