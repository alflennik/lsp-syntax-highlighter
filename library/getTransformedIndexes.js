const processIndexes = (code, sections) => {
  const originalToTransformed = createThreeWayMap()

  const parts = getParts(code, sections)

  let transformedLineIndex = 0
  let transformedColumnIndex = 0

  for (const part of parts) {
    const data = { type: part.type }

    const originalIndex = `${part.lineIndex}:${part.columnIndex}`
    const transformedIndex = `${transformedLineIndex}:${transformedColumnIndex}`

    originalToTransformed.set(originalIndex, transformedIndex, data)

    if (!part.skipped) {
      transformedColumnIndex += part.content.length
    }
  }
}

const getParts = (lines, section) => {
  const skipsByLineUncombined = {}
  for (const skippedSection of section.skippedSections) {
    for (let i = skippedSection.startLineIndex; i < skippedSection.endLineIndex; i += 1) {
      const isFirstLine = i === skippedSection.startLineIndex
      const isLastLine = i === skippedSection.endLineIndex - 1
      const isMiddleLine = !isFirstLine && !isLastLine

      if (!skipsByLine[i]) skipsByLine[i] = []

      if (isFirstLine && isLastLine) {
        skipsByLine[i].push({
          startColumnIndex: section.startColumnIndex,
          endColumnIndex: section.endColumnIndex,
          replacement,
        })
      } else if (isFirstLine) {
        skipsByLine[i].push({ startColumnIndex: section.startColumnIndex, replacement })
      } else if (isLastLine) {
        skipsByLine[i].push({ endColumnIndex: section.endColumnIndex })
      } else if (isMiddleLine) {
        skipsByLine[i].push({})
      }
    }
  }

  const skipsByLine = Object.entries(skipsByLineUncombined).map(([i, skips]) => {
    const newSkip = {}
    for (const skip of skips) {
      if (!newSkip.startColumnIndex || skip.startColumnIndex < newSkip.startColumnIndex) {
        newSkip.startColumnIndex = skip.startColumnIndex
      }
      if (!newSkip.endColumnIndex || skip.endColumnIndex > newSkip.endColumnIndex) {
        newSkip.endColumnIndex = skip.endColumnIndex
      }
      if (skip.replacement) {
        if (!newSkip.replacement) newSkip.replacements = {}
        newSkip.replacements[skip.startColumnIndex ?? 0] = skip.replacement
      }
    }
    return newSkip
  })

  const parts = []

  for (let i = section.startLineIndex; i < section.endLineIndex; i += 1) {
    const isFirstLine = i === section.startLineIndex
    const isLastLine = i === section.endLineIndex - 1
    const isMiddleLine = !isFirstLine && !isLastLine

    const skip = skipsByLine[i]

    const addContentPart = (startColumnIndex, endColumnIndex) => {
      const content = lines[i].slice(startColumnIndex, endColumnIndex)
      if (content.length) {
        parts.push({ lineIndex: i, columnIndex: startColumnIndex, content, type: "section" })
      }
    }

    const addSkipPart = (startColumnIndex, endColumnIndex) => {
      const content = lines[i].slice(startColumnIndex, endColumnIndex)
      parts.push({
        lineIndex: i,
        columnIndex: startColumnIndex,
        content,
        type: "skipped",
        replacements: skip.replacements,
      })
    }

    if (isFirstLine && isLastLine) {
      if (skip) {
        addContentPart(section.startColumnIndex, skip.startColumnIndex)
        addSkipPart(skip.startColumnIndex, skip.endColumnIndex)
        addContentPart(skip.endColumnIndex, section.endColumnIndex)
      } else {
        addContentPart(startColumnIndex, endColumnIndex)
      }
    } else if (isFirstLine) {
      if (skip) {
        if (skip.endColumnIndex) {
          addContentPart(section.startColumnIndex, skip.startColumnIndex)
          addSkipPart(skip.startColumnIndex, skip.endColumnIndex)
          addContentPart(skip.endColumnIndex)
        } else {
          addContentPart(section.startColumnIndex, skip.startColumnIndex)
          addSkipPart(skip.startColumnIndex)
        }
      } else {
        addContentPart(section.startColumnIndex)
      }
    } else if (isLastLine) {
      if (skip) {
        if (skip.startColumnIndex) {
          addContentPart(0, skip.startColumnIndex)
          addSkipPart(skip.startColumnIndex, skip.endColumnIndex)
          addContentPart(skip.endColumnIndex, section.endColumnIndex)
        } else {
          addSkipPart(0, skip.endColumnIndex)
          addContentPart(skip.endColumnIndex, section.endColumnIndex)
        }
      } else {
        addContentPart(0, section.endColumnIndex)
      }
    } else if (isMiddleLine) {
      if (skip) {
        if (skip.startColumnIndex) {
          if (skip.endColumnIndex) {
            addContentPart(0, skip.startColumnIndex)
            addSkipPart(skip.startColumnIndex, skip.endColumnIndex)
            addContentPart(skip.endColumnIndex)
          } else {
            addContentPart(0, skip.startColumnIndex)
            addSkipPart(skip.startColumnIndex)
          }
        } else {
          if (skip.endColumnIndex) {
            addSkipPart(0, skip.endColumnIndex)
            addContentPart(skip.endColumnIndex)
          }
        }
      } else {
        addContentPart(0)
      }
    }

    if (content1) {
      parts.push({ lineIndex: i, columnIndex: 0 })
    }
  }

  if (section.endContextString) {
    parts.push({ content: endContextString, original: false, transformed: true })
  }
}

const createThreeWayMap = () => {
  const map1 = new Map()
  const map2 = new Map()
  const map3 = new Map()

  const set = (item1, item2, item3) => {
    map1.set(item1, [item2, item3])
    map2.set(item2, [item1, item3])
    map3.set(item3, [item1, item2])
  }

  const get1 = item1 => {
    const [item2, item3] = map1.get(item1)
    return [item1, item2, item3]
  }

  const get2 = item2 => {
    const [item1, item3] = map1.get(item2)
    return [item1, item2, item3]
  }

  const get3 = item3 => {
    const [item1, item2] = map1.get(item3)
    return [item1, item2, item3]
  }

  return { set, get1, get2, get3 }
}
