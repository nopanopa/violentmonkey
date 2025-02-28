export function normalizeKeys(key) {
  if (key == null) return [];
  if (Array.isArray(key)) return key;
  return `${key}`.split('.').filter(Boolean);
}

export function objectGet(obj, rawKey, def) {
  const keys = normalizeKeys(rawKey);
  let res = obj;
  keys.every((key) => {
    if (res && typeof res === 'object' && (key in res)) {
      res = res[key];
      return true;
    }
    res = def;
    return false;
  });
  return res;
}

export function objectSet(obj, rawKey, val) {
  const keys = normalizeKeys(rawKey);
  if (!keys.length) return val;
  const root = obj || {};
  let sub = root;
  const lastKey = keys.pop();
  keys.forEach((key) => {
    sub = sub[key] || (sub[key] = {});
  });
  if (typeof val === 'undefined') {
    delete sub[lastKey];
  } else {
    sub[lastKey] = val;
  }
  return root;
}

/**
 * @param {{}} obj
 * @param {string[]} keys
 * @param {function(value,key):?} [transform]
 * @returns {{}}
 */
export function objectPick(obj, keys, transform) {
  return keys.reduce((res, key) => {
    let value = obj?.[key];
    if (transform) value = transform(value, key);
    if (value != null) res[key] = value;
    return res;
  }, {});
}

// invoked as obj::mapEntry(([key, value], i, allEntries) => transformedValue)
export function mapEntry(func) {
  return Object.entries(this).reduce((res, entry, i, allEntries) => {
    res[entry[0]] = func(entry, i, allEntries);
    return res;
  }, {});
}

// invoked as obj::forEachEntry(([key, value], i, allEntries) => {})
export function forEachEntry(func, thisObj) {
  if (this) Object.entries(this).forEach(func, thisObj);
}

// invoked as obj::forEachKey(key => {}, i, allKeys)
export function forEachKey(func, thisObj) {
  if (this) Object.keys(this).forEach(func, thisObj);
}

// invoked as obj::forEachValue(value => {}, i, allValues)
export function forEachValue(func, thisObj) {
  if (this) Object.values(this).forEach(func, thisObj);
}

// Needed for Firefox's browser.storage API which fails on Vue observables
export function deepCopy(src) {
  return src && (
    /* Not using `map` because its result belongs to the `window` of the source,
     * so it becomes "dead object" in Firefox after GC collects it. */
    Array.isArray(src) && Array.from(src, deepCopy)
    // Used in safe context
    // eslint-disable-next-line no-restricted-syntax
    || typeof src === 'object' && src::mapEntry(([, val]) => deepCopy(val))
  ) || src;
}

// Simplified deep equality checker
export function deepEqual(a, b) {
  let res;
  if (!a || !b || typeof a !== typeof b || typeof a !== 'object') {
    res = a === b;
  } else if (Array.isArray(a)) {
    res = a.length === b.length
      && a.every((item, i) => deepEqual(item, b[i]));
  } else {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    res = keysA.length === keysB.length
      && keysA.every(key => keysB.includes(key) && deepEqual(a[key], b[key]));
  }
  return res;
}
