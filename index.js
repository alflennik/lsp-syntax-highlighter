const database = require("./database.json")
const semanticTokens = require("./semanticTokens.json")

const convertScopeToSemanticToken = scope => {
  const exact = database[scope]

  if (exact) return semanticTokensFlipped[exact]

  let i = 0
  let simplifiedScope = scope
  while (simplifiedScope.includes(".")) {
    i += 1
    if (i > 1000) throw new Error("Infinite loop detected")
    simplifiedScope = simplifiedScope.split(".").slice(0, -1).join(".")

    const result = database[simplifiedScope]
    if (result) return semanticTokensFlipped[result]
  }

  return "other"
}

const semanticTokensFlipped = Object.fromEntries(
  Object.entries(semanticTokens).map(([key, value]) => [value, key]),
)

module.exports = convertScopeToSemanticToken
