const Converter = require("./convertGrammarScopeToDatabaseScope")

const database = require("../database.json")

const scopesByRank = {}

Object.entries(database.primary).forEach(([scope, { rank }]) => {
  if (!scopesByRank[rank]) scopesByRank[rank] = []
  scopesByRank[rank].push(scope)
})

const convertGrammarScopeToDatabaseScope = Converter(scopesByRank)

convertGrammarScopeToDatabaseScope(
  // prettier-ignore
  [
    'source.js',
    'meta.var.expr.js',
    'meta.objectliteral.js',
    'meta.object.member.js',
    'meta.object-literal.key.js',
    'punctuation.separator.key-value.js',
  ],
  { diagnosticReturnAllMatches: true },
)
