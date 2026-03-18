const Converter = require("./convertGrammarScopeToDatabaseScope")

const database = require("../database.json")

const scopesByRank = {}

Object.entries(database.primary).forEach(([scope, { rank }]) => {
  if (!scopesByRank[rank]) scopesByRank[rank] = []
  scopesByRank[rank].push(scope)
})

const convertGrammarScopeToDatabaseScope = Converter(scopesByRank)

convertGrammarScopeToDatabaseScope(
  ["source.css", "meta.selector.css", "entity.other.attribute-name.class.css"],
  { diagnosticReturnAllMatches: true },
)
