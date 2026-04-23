// Execute this file with node to run

const analyze = require("../library/analyze")

const analyzeShikiGrammars = async () => {
  const { bundledLanguages, bundledThemes } = await import("shiki")

  const themes = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledThemes).map(async ([name, importer]) => {
        const themeModule = await importer()
        return [name, themeModule.default]
      }),
    ),
  )

  const allGrammars = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledLanguages).map(async ([name, importer]) => {
        const imported = await importer()
        const grammar = imported.default.at(-1) // Dependent languages will be listed first
        return [grammar.scopeName, grammar]
      }),
    ),
  )

  const grammarToUse = allGrammars["source.css"]

  const analysis = await analyze({ grammar: grammarToUse, themes })

  console.log(analysis)
}

analyzeShikiGrammars()
