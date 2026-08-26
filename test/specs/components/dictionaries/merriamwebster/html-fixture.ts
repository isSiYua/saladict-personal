import { MerriamWebsterResultV2 } from '@/components/dictionaries/merriamwebster/engine'

/**
 * Build the smallest Merriam-Webster-shaped document that exercises every
 * selector used by the parser tests. Keeping this fixture in source makes the
 * suite deterministic and avoids depending on the live site's anti-bot HTML.
 */
export function buildMerriamWebsterFixture(
  expected: MerriamWebsterResultV2
): Document {
  return new DOMParser().parseFromString(
    `<main id="left-content">
      ${expected.groups.map(renderGroup).join('')}
      ${renderSynonyms(expected.synonyms)}
      ${renderEtymology(expected.etymology)}
    </main>`,
    'text/html'
  )
}

function renderGroup(
  group: MerriamWebsterResultV2['groups'][number],
  index: number
): string {
  return `<div class="entry-word-section-container" id="dictionary-entry-${
    index + 1
  }">
    <div class="entry-header-content"><span class="hword">${escapeHtml(
      group.title
    )}</span></div>
    ${
      group.pos
        ? `<h2 class="parts-of-speech"><a class="important-blue-link">${escapeHtml(
            group.pos
          )}</a></h2>`
        : ''
    }
    ${renderPronunciation(group.pr)}
    ${
      group.conjugation
        ? `<div class="row headword-row header-ins"><span class="vg-ins">${escapeHtml(
            group.conjugation
          )}</span></div>`
        : ''
    }
    ${group.sections.map(renderSection).join('')}
  </div>`
}

function renderPronunciation(
  pronunciation: MerriamWebsterResultV2['groups'][number]['pr']
): string {
  if (!pronunciation) return ''

  return `<div class="word-syllables-prons-header-content">
    ${
      pronunciation.syllable
        ? `<span class="word-syllables-entry">${escapeHtml(
            pronunciation.syllable
          )}</span>`
        : ''
    }
    <span class="prons-entries-list-inline">
      ${pronunciation.phonetics
        .map(phonetic => {
          const audio = phonetic.audio
            ? /\/mp3\/([^/]+)\/([^/.]+)\.mp3$/.exec(phonetic.audio)
            : null
          const audioAttrs = audio
            ? ` data-dir="${escapeHtml(audio[1])}" data-file="${escapeHtml(
                audio[2]
              )}" data-lang="en_us"`
            : ''
          return `<span class="prons-entry-list-item"${audioAttrs}>${escapeHtml(
            phonetic.symbol
          )}</span>`
        })
        .join('')}
    </span>
  </div>`
}

function renderSection(
  section: MerriamWebsterResultV2['groups'][number]['sections'][number]
): string {
  return `<div class="vg">
    ${
      section.title
        ? `<p class="vd"><a class="important-blue-link">${escapeHtml(
            section.title
          )}</a></p>`
        : ''
    }
    ${section.meaningGroups
      .map(
        meanings => `<div class="vg-sseq-entry-item">
          ${meanings
            .map(
              meaning => `<div class="sb-entry">
                <span class="dtText">${escapeHtml(meaning.explaining)}</span>
                ${(meaning.examples || [])
                  .map(
                    example =>
                      `<span class="ex-sent sents">${escapeHtml(example)}</span>`
                  )
                  .join('')}
              </div>`
            )
            .join('')}
        </div>`
      )
      .join('')}
  </div>`
}

function renderSynonyms(
  synonyms: MerriamWebsterResultV2['synonyms']
): string {
  if (!synonyms) return ''
  return `<section id="synonyms"><div class="content-section-body">
    ${synonyms
      .map(([label]) => `<p class="function-label">${escapeHtml(label)}</p>`)
      .join('')}
    ${synonyms
      .map(
        ([, words]) => `<ul class="synonyms-antonyms-grid-list">
          ${words
            .map(word => `<li><a lang="en">${escapeHtml(word)}</a></li>`)
            .join('')}
        </ul>`
      )
      .join('')}
  </div></section>`
}

function renderEtymology(
  etymology: MerriamWebsterResultV2['etymology']
): string {
  if (!etymology) return ''
  return `<section id="word-history"><div class="etymology-content-section">
    ${etymology
      .map(([label]) => `<p class="function-label">${escapeHtml(label)}</p>`)
      .join('')}
    ${etymology
      .map(([, text]) => `<p class="et">${escapeHtml(text)}</p>`)
      .join('')}
  </div></section>`
}

function escapeHtml(value: string | undefined): string {
  return (value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
