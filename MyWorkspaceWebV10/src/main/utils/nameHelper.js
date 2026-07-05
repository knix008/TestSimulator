function compareNames(a, b) {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function orderByName(items, selector) {
  return [...items].sort((left, right) => compareNames(selector(left), selector(right)));
}

function makeUnique(name, existingNames) {
  const taken = new Set(existingNames);
  if (!taken.has(name)) {
    return name;
  }

  let index = 2;
  while (taken.has(`${name} (${index})`)) {
    index += 1;
  }
  return `${name} (${index})`;
}

module.exports = {
  compareNames,
  orderByName,
  makeUnique
};
