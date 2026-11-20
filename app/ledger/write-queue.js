/**
 * Serializes writes with the same key without blocking writes for unrelated keys.
 * A failed write settles its slot, allowing later writes to proceed. Callers
 * still receive their own rejection rather than a silently recovered result.
 */
export function createKeyedWriteQueue() {
  const tails = new Map();
  return (key, write) => {
    const previous = tails.get(key);
    const current = (previous ? previous.catch(() => {}) : Promise.resolve()).then(write);
    tails.set(key, current);
    const retire = () => { if (tails.get(key) === current) tails.delete(key); };
    current.then(retire, retire);
    return current;
  };
}
