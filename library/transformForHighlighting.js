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

const transformForHighlighting = ({ code, section }) => {
  /**
   * {
   *   type: "replacement" | "section",
   *   offset: number,
   *   content: string,
   *   replacement?: string,
   * }
   */
  const parts = []

  const chars = code.split("")

  if (section.replacements) {
    section.replacements.forEach(replacement => {
      const { text, startOffset, endOffset } = replacement
      const content = extract(chars, startOffset, endOffset)
      parts.push({ type: "replacement", offset: startOffset, content, ...(text && { text }) })
    })
  }

  let currentOffset
  let currentContent
  for (let i = 0; i < chars.length; i += 1) {
    const char = chars[i]
    if (char) {
      if (!currentContent) {
        currentOffset = i
        currentContent = char
      } else {
        currentContent += char
      }
    } else {
      if (currentContent) {
        parts.push({ type: "section", offset: currentOffset, content: currentContent })
        currentOffset = undefined
        currentContent = undefined
      }
    }
  }

  parts.sort((a, b) => a.offset - b.offset)
  ;(() => {
    let lineIndex = 0
    let columnIndex = 0
    for (let i = 0; i < parts.length; i += 1) {
      parts[i].lineIndex = lineIndex
      parts[i].columnIndex = columnIndex

      const content = parts[i].content
      const newlineCount = content.filter(character => character === "\n").length
      lineIndex += newlineCount

      if (newlineCount) {
        columnIndex = content.length - content.lastIndexOf("\n")
      }
    }
  })()

  let transformed = ""
  const offsetConversions = {}

  if (section.startContextString) {
    offsetConversions[0] = null
    transformed += section.startContextString
  }

  let transformedLineIndex = 0
  let transformedColumnIndex = 0

  for (const part of parts) {
    const {
      type,
      offset: originalOffset,
      lineIndex: originalLineIndex,
      columnIndex: originalColumnIndex,
      content,
      replacement,
    } = part

    let contentToAdd
    if (type === "section") {
      contentToAdd = content
    } else if (type === "replacement" && replacement) {
      contentToAdd = replacement
    }

    if (contentToAdd) {
      const newlineCount = content.filter(character => character === "\n").length
      lineIndex += newlineCount

      if (newlineCount) {
        columnIndex = content.length - content.lastIndexOf("\n")
      }

      const key = `${transformedLineIndex}:${transformedColumnIndex}`

      offsetConversions[key] = { originalLineIndex, originalColumnIndex, originalOffset }

      transformed += contentToAdd
    }
  }

  return { transformed, offsetConversions }
}

const extract = (array, startIndex, endIndex) => {
  const chars = []
  for (let i = startIndex; i < endIndex; i += 1) {
    chars.push(array[i])
    array[i] = undefined
  }
  return chars.join()
}

module.exports = transformForHighlighting
