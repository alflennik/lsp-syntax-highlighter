const initializeHighlight = require("./highlight")

const createHighlighter = () => {
  let database
  let highlightPromise

  const load = databasePath => {
    try {
      database = require(databasePath)
    } catch (error) {
      console.error(
        "Failed to load compiled grammars database. Please ensure the file exists at the path " +
          "you've specified",
      )
      throw error
    }
    highlightPromise = initializeHighlight(database)
  }

  const highlight = async (...args) => {
    if (!database) {
      throw new Error("Cannot highlight because `highlighter.load(databasePath)` was never called")
    }
    const { highlight: highlightSync } = await highlightPromise
    return highlightSync(...args)
  }

  const getCapabilities = () => {
    if (!database) {
      throw new Error(
        "Cannot get capabilities because `highlighter.load(databasePath)` was never called",
      )
    }

    let colorArray = []
    for (let i = 0; i < database.colorCount; i += 1) {
      colorArray.push(`color${i}`)
    }

    return {
      semanticTokensProvider: {
        legend: { tokenTypes: colorArray, tokenModifiers: [] },
        full: true,
      },
    }
  }

  return { load, getCapabilities, highlight }
}

const highlighter = createHighlighter()

module.exports = highlighter
