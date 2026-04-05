/* // test
json.parse(*({ "greeting": "hi", "test": [true, false, 99] })*)

applyStyles(*(.headline {
  color: white;
  font-weight: 400;
  background: #333;
})*)

return *(
  <div 
    style=*{
      .getStyles(*(
        font-size: 1.2em;
        text-transform: uppercase;
        font-style: underline;
      )*)
    }>
      Dashboard
    </div>
)*<Source.Html>
*/

const transformForHighlighting = ({ text, section }) => {
  const parts = []

  const characters = text.split("")

  if (section.replacements) {
    section.replacements.forEach(replacement => {
      const { text: replacementText, startOffset, endOffset } = replacement
      const content = extract(characters, startOffset, endOffset)
      parts.push({
        type: "replacement",
        originalOffset: startOffset,
        content,
        ...(replacementText && { replacementText }),
      })
    })
  }

  ;(() => {
    let currentOffset
    let currentContent

    for (let i = section.startOffset; i < section.endOffset; i += 1) {
      const character = characters[i]
      if (character) {
        if (!currentContent) {
          currentOffset = i
          currentContent = character
        } else {
          currentContent += character
        }
      } else {
        if (currentContent) {
          parts.push({ type: "section", originalOffset: currentOffset, content: currentContent })
          currentOffset = undefined
          currentContent = undefined
        }
      }
    }
    if (currentContent) {
      parts.push({ type: "section", originalOffset: currentOffset, content: currentContent })
    }
  })()

  parts.sort((a, b) => a.originalOffset - b.originalOffset)
  ;(() => {
    const precedingText = text.slice(0, section.startOffset)
    const precedingNewlines = precedingText.split("").filter(character => character === "\n").length

    originalLineIndex = precedingNewlines

    if (precedingNewlines) {
      originalColumnIndex = precedingText.length - precedingText.lastIndexOf("\n") - 1
    } else {
      originalColumnIndex = precedingText.length
    }

    for (let i = 0; i < parts.length; i += 1) {
      parts[i].originalLineIndex = originalLineIndex
      parts[i].originalColumnIndex = originalColumnIndex

      const content = parts[i].content
      const newlineCount = content.split("").filter(character => character === "\n").length
      originalLineIndex += newlineCount

      if (newlineCount) {
        originalColumnIndex = content.length - content.lastIndexOf("\n") - 1
      }
    }
  })()

  let transformed = ""

  for (let i = 0; i < parts.length; i += 1) {
    const { type, content, replacementText } = parts[i]

    let contentToAdd
    if (type === "section") {
      contentToAdd = content
    } else if (type === "replacement" && replacementText) {
      contentToAdd = replacementText
    }

    if (contentToAdd) {
      parts[i].transformedOffset = transformed.length

      transformed += contentToAdd
    }
  }

  const convertIndexes = transformedOffset => {
    const part = binarySearch(parts, candidate => {
      if (transformedOffset < candidate.transformedOffset) {
        return 1
      } else if (transformedOffset > candidate.transformedOffset) {
        return -1
      } else if (transformedOffset === candidate.transformedOffset) {
        return 0
      }
    })

    if (part.type === "replacement") return null

    const delta = transformedOffset - part.transformedOffset
    const deltaContent = transformed.slice(part.transformedOffset, transformedOffset)
    const deltaNewlines = deltaContent.split("").filter(character => character === "\n").length

    const originalOffset = part.originalOffset + delta

    const originalLineIndex = part.originalLineIndex + deltaNewlines

    const originalColumnIndex = deltaNewlines
      ? deltaContent.length - deltaContent.lastIndexOf("\n") - 1
      : part.originalColumnIndex + deltaContent.length

    return { originalOffset, originalLineIndex, originalColumnIndex }
  }

  return { transformed, convertIndexes }
}

const binarySearch = (array, compare) => {
  let searchStart = 0
  let searchEnd = array.length - 1
  let candidateIndex = null

  while (searchStart <= searchEnd) {
    const middleIndex = Math.floor((searchStart + searchEnd) / 2)
    const comparison = compare(array[middleIndex])

    if (comparison === 0) {
      return array[middleIndex]
    } else if (comparison === -1) {
      candidateIndex = middleIndex
      searchStart = middleIndex + 1
    } else if (comparison === 1) {
      searchEnd = middleIndex - 1
    }
  }

  return candidateIndex === null ? null : array[candidateIndex]
}

const extract = (array, startIndex, endIndex) => {
  const characters = []
  for (let i = startIndex; i < endIndex; i += 1) {
    characters.push(array[i])
    array[i] = undefined
  }
  return characters.join()
}

module.exports = transformForHighlighting
