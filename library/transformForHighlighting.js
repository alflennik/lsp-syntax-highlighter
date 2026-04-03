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

const convertOffsets = (code, section) => {
  /**
   * {
   *   type: "skipped" | "section",
   *   offset: number,
   *   content: string,
   *   replacement?: string,
   * }
   */
  const parts = []

  const chars = code.split("")

  if (section.skippedSections) {
    for (const skippedSection of section.skippedSections) {
      const { replacement, startOffset, endOffset } = skippedSection
      const content = extract(chars, startOffset, endOffset)
      parts.push({
        type: "skipped",
        offset: startOffset,
        content,
        ...(replacement && { replacement }),
      })
    }
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

  let transformed = ""
  const offsetConversions = {}

  if (section.startContextString) {
    offsetConversions[0] = null
    transformed += section.startContextString
  }

  for (const { type, offset, content, replacement } of parts) {
    if (type === "section") {
      offsetConversions[transformed.length] = offset
      transformed += content
    } else if (type === "skipped" && replacement) {
      offsetConversions[transformed.length] = offset
      transformed += replacement
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
