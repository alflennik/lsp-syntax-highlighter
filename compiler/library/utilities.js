const fsStandard = require("fs")
const path = require("path")
const omit = require("lodash.omit")

const initializeScopeNameToColor = async () => {
  const { createHighlighter, bundledThemes } = await import("shiki")

  // Allows you to feed in a scope and get a color back on the other side
  const debuggingGrammar = {
    scopeName: "source.debug-scopes",
    name: "debugging-grammar",
    patterns: [{ match: "\\b([a-zA-Z0-9-_. ]+)\\b", captures: { 1: { name: "$1" } } }],
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

  return { scopeNameToColor }
}

const sortObjectKeys = obj =>
  Object.keys(obj)
    .sort()
    .reduce((acc, key) => ({ ...acc, [key]: obj[key] }), {})

const requireWithLocalMode = (packageStringRaw, LOCAL_PACKAGES) => {
  const isLocal = LOCAL_PACKAGES === "true"

  const isPackage = (() => {
    const fileNames = fsStandard.readdirSync(path.resolve(__dirname, "../../"))
    return !(
      fileNames.includes("compiler") &&
      fileNames.includes("highlighter") &&
      !fileNames.includes("package.json")
    )
  })()

  if (!isPackage && LOCAL_PACKAGES === undefined) {
    throw new Error(
      "When running locally you must use a LOCAL_PACKAGES=true or LOCAL_PACKAGES=false " +
        "environment variable",
    )
  }

  if (
    !(
      packageStringRaw.startsWith("lsp-syntax-highlighter") ||
      packageStringRaw.startsWith("lsp-syntax-highlighter-compiler")
    )
  ) {
    throw new Error("Invalid local package")
  }

  if (isLocal) {
    const packageString = packageStringRaw
      .replace(/^lsp-syntax-highlighter-compiler/, "compiler")
      .replace(/^compiler$/, "compiler/")
      .replace(/^lsp-syntax-highlighter/, "highlighter")
      .replace(/^highlighter$/, "highlighter/")

    return require(`../../${packageString}`)
  } else {
    return require(packageString)
  }
}

module.exports = { initializeScopeNameToColor, requireWithLocalMode }
