const omit = require("lodash.omit")

const createScopeNameToColor = async () => {
  const { createHighlighter, bundledThemes } = await import("shiki")

  // Allows you to feed in a scope and get a color back on the other side
  const debuggingGrammar = {
    scopeName: "source.debug-scopes",
    name: "debugging-grammar",
    patterns: [{ match: "\\b([a-zA-Z0-9-_.]+)\\b", captures: { 1: { name: "$1" } } }],
  }
  const highlighter = await createHighlighter({
    langs: [debuggingGrammar],
    themes: Object.keys(bundledThemes),
  })

  const scopeNameToColor = ({ scopeName, themeName }) => {
    const output = highlighter.codeToTokens(scopeName, {
      lang: "debugging-grammar",
      theme: themeName,
    })

    return JSON.stringify(sortObjectKeys(omit(output.tokens[0][0], ["content", "offset"])))
  }

  return scopeNameToColor
}

const walkObjects = (value, callback) => {
  if (value === null || typeof value !== "object") return

  if (Array.isArray(value)) {
    value.forEach(item => walkObjects(item, callback))
    return
  }

  callback(value)
  Object.values(value).forEach(v => walkObjects(v, callback))
}

const sortObjectKeys = obj =>
  Object.keys(obj)
    .sort()
    .reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {})

module.exports = { createScopeNameToColor, walkObjects }
