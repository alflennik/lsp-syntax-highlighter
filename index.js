const database = require("./database.json")
const semanticTokens = require("./semanticTokens.json")

const convertScopeToSemanticToken = scope => {
  const exact = database[scope]

  if (exact) return semanticTokensFlipped[exact]

  const nestedScopes = scope.split(" ")

  for (let i = nestedScopes.length - 1; i >= 0; i -= 1) {
    const nestedScopeComponents = nestedScopes[i].split(".")

    for (let j = nestedScopeComponents.length - 1; j > 0; j -= 1) {
      const candidate = [
        ...(i > 0 ? nestedScopes.slice(0, i) : []),
        nestedScopeComponents.slice(0, j).join("."),
        ...(i < nestedScopes.length - 1 ? nestedScopes.slice(i) : []),
      ].join(" ")

      const found = database[candidate]
      if (found) return semanticTokensFlipped[found]
    }
  }

  return semanticTokensFlipped[database.default]
}

const semanticTokensFlipped = Object.fromEntries(
  Object.entries(semanticTokens).map(([key, value]) => [value, key]),
)

module.exports = convertScopeToSemanticToken
