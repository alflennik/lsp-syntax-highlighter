# Converter for TextMate Grammar Scopes to Semantic Tokens For LSPs

Converts a TextMate Grammar scope to a semantic token. The semantic token returned will be the one most likely to produce the same color that the TextMate grammar would, based on real-world results gathered from the [shiki](https://www.npmjs.com/package/shiki) collection of prominent themes and grammars.

## Usage

```js
const convertScopeToSemanticToken = require('textmate-grammar-to-semantic-tokens')

const semanticToken = convertScopeToSemanticToken('punctuation.definition.string.html')

console.log(semanticToken) // "string.declaration"
```

A library like [vscode-textmate](https://www.npmjs.com/package/vscode-textmate) is recommended to load the textmate grammar scopes in the first place.

## Installation

```
npm install textmate-grammar-to-semantic-tokens
```

In order to use in a VSCode extension, you need add the following to your extension's package.json:

```json
{
  // ...
  "contributes": {
    "semanticTokenScopes": [
      {
        "scopes": {
          "comment": ["comment"],
          "punctuation": ["punctuation"],
          "variable.general": ["variable"],
          "keyword.readonly": ["constant.language"],
          "variable.general.readonly": ["constant"],
          "keyword.definition": ["storage.type"],
          "keyword": ["keyword"],
          "string": ["string"],
          "punctuation.readonly": ["constant.character"],
          "variable.variant": ["entity.name"],
          "other": ["default"],
          "other.defaultLibrary": ["support"],
          "keyword.variant": ["keyword.control"],
          "variable.defaultLibrary": ["variable.language"],
          "operator": ["keyword.operator"],
          "keyword.general": ["keyword.other"],
          "operator.variant": ["keyword.operator.expression"],
          "string.declaration": ["punctuation.definition.string"],
          "label.definition": ["punctuation.definition.tag"],
          "label": ["entity.name.tag"],
          "invalid": ["invalid"],
          "punctuation.embeddedLanguage": ["punctuation.section.embedded"],
        }
      }
    ]
  }
}
```

## Conversion Database

You can directly import the translation database:

```js
const conversionDatabase = require('textmate-grammar-to-semantic-tokens/database.json')

console.log(conversionDatabase) /* {
  'case-clause.expr': 'keyword'
  'comment.block.documentation.js': 'keyword'
  'comment.block.js': 'keyword'
  'comment.line.double-slash.js': 'keyword'
  // ...
} */
```

## Building The Database From Scratch

See the dedicated guide: [./build-database/README.md](./build-database/README.md)

## Background

Editors like VSCode support two types of syntax highlighting, TextMate Grammars, which are available for every language you've ever heard of, and Semantic Tokens, which can be emitted by language servers under the language server protocol (LSP), which are more powerful but not always widely available.

Unfortunately, language servers are stuck with one of these two options, since the LSP protocol only supports semantic tokens. TextMate Grammars are completely unsupported at this stage. See the (closed) issue here: https://github.com/microsoft/vscode/issues/86329, and more context here: https://github.com/microsoft/vscode/issues/86329.

This package allows you to use a TextMate Grammar in an LSP by converting it to semantic tokens. This will allow you to use your language's existing TextMate Grammar within your LSP, and perhaps more importantly it will make it possible to apply embedded languages' syntax highlighting within your language's syntax highlighting, for example in JavaScript allowing a string like the following to be highlighted properly without needing to fork JavaScript's extremely complicated TextMate Grammar:

```js
const htmlString = /* html */`<h1>Hello</h1>`
```

## Methodology

To build the conversion database, I took a list of all the rule names in prominent textmate grammars in the shiki library and counted which semantic tokens produced the correct color for each theme. The semantic token with the highest count was the one that ultimately made it to the final conversion database.
