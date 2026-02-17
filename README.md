# Semantic Token Converter

Converts a TextMate Grammar scope to a semantic token, allowing you to use TextMate syntax highlighting in a language server.

## Usage

```js
const convertScopeToSemanticToken = require('semantic-token-converter')

const semanticToken = convertScopeToSemanticToken('punctuation.definition.string.html')

console.log(semanticToken) // "string.declaration"
```

A library like [vscode-textmate](https://www.npmjs.com/package/vscode-textmate) is recommended to load the textmate grammar scopes in the first place.

## Installation

```
npm install semantic-token-converter
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

## Background

Editors like VSCode support two types of syntax highlighting, TextMate Grammars, which are available for every language you've ever heard of, and Semantic Tokens, which can be emitted by language servers under the language server protocol (LSP), which are more powerful but not always widely available.

Unfortunately, language servers are stuck with one of these two options, since the LSP protocol only supports semantic tokens. TextMate Grammars are completely unsupported at this stage. See the (closed) issue here: https://github.com/microsoft/vscode/issues/86329, and more context here: https://github.com/microsoft/vscode/issues/86329.

This package allows you to use a TextMate Grammar in an LSP by converting it to semantic tokens. This will allow you to use your language's existing TextMate Grammar within your LSP, and perhaps more importantly it will make it possible to apply embedded languages' syntax highlighting within your language's syntax highlighting, for example in JavaScript allowing a string like the following to be highlighted properly without needing to fork JavaScript's extremely complicated TextMate Grammar:

```js
const htmlString = /* html */`<h1>Hello</h1>`
```

## Methodology

To build the conversion database, I took a list of all the scopes used in the prominent textmate grammars and themes in the shiki library, and used a kmedioids clustering algorithm called fasterPAM to map similar scope to a small number of core scopes. The translation from the scopes to semantic tokens was manual.

## Advanced Usage

### Conversion Database

You can directly import the translation database:

```js
const conversionDatabase = require('textmate-grammar-to-semantic-tokens/database.json')

console.log(conversionDatabase) /* {
  'keyword.struct.go': 'keyword'
  'comment.block.documentation.cs': 'comment',
  'comment.block.preprocessor': 'comment',
  'support.module.elm': 'support',
  // ...
} */
```

### Building The Database From Scratch

See the dedicated guide: [./build-database/README.md](./build-database/README.md)

### Using the Demo

You can spin up the same demo I used to confirm that the conversions are working. See the dedicated guide: [./demo/README.md](./demo/README.md)

![Screenshot of demo environment](./demo/demo.png)