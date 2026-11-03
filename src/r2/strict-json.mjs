// Shared data-only parser; no CLI policy or runtime imports.
export function parseUniqueJson(text) {
  const parsed = JSON.parse(text), stack = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') stack.push(new Set());
    else if (c === '[') stack.push(null);
    else if (c === '}' || c === ']') stack.pop();
    else if (c === '"') {
      const start = i++;
      while (text[i] !== '"') { if (text[i] === '\\') i++; i++; }
      let next = i + 1;
      while (' \t\r\n'.includes(text[next]) && next < text.length) next++;
      if (text[next] === ':') {
        const name = JSON.parse(text.slice(start, i + 1)), names = stack.at(-1);
        if (names.has(name)) throw Error('duplicate JSON object member');
        names.add(name);
      }
    }
  }
  return parsed;
}
