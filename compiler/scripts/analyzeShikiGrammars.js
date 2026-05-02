// Execute this file with node to run

const fs = require("fs/promises")
const path = require("path")
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

  const grammars = await Object.fromEntries(
    await Promise.all(
      Object.entries(bundledLanguages).map(async ([name, importer]) => {
        const imported = await importer()
        const grammar = imported.default.at(-1) // Dependent languages will be listed first
        return [grammar.name, grammar]
      }),
    ),
  )

  for (const grammar of Object.values(grammars).slice(114)) {
    try {
      const analysis = await analyze({ grammar, themes })

      await fs.writeFile(
        path.resolve(__dirname, `../analysis/${grammar.name}.json`),
        JSON.stringify(analysis),
        { encoding: "utf-8" },
      )
    } catch (error) {
      console.error(error)
    }
  }
}

analyzeShikiGrammars()
