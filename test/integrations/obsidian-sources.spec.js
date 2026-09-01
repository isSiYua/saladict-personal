const {
  applicableSources,
  createSaladictSources,
  parseBaiduTranslation,
  parseBingHtml,
  parseCambridgeHtml,
  parseCollinsHtml,
  parseCaiyunTranslation,
  parseEtymonlineHtml,
  parseFreeDictionaryJson,
  parseOxfordHtml,
  parseYoudaoHtml,
  parseYoudaoTranslationHtml
} = require('../../integrations/obsidian/saladict-sources')

describe('Obsidian Saladict dictionary adapters', () => {
  test('deduplicates concurrent lookups and serves repeated results from memory', async () => {
    const request = jest.fn(async () => ({
      status: 200,
      json: [['译文']],
      text: ''
    }))
    const [google] = createSaladictSources({
      request,
      enabledSourceIds: ['google']
    })
    const settings = {
      targetLanguage: 'zh-CN',
      maxSelectionChars: 1200
    }

    const [first, second] = await Promise.all([
      google.lookup('cache this sentence', settings),
      google.lookup('cache this sentence', settings)
    ])
    const third = await google.lookup('cache this sentence', settings)

    expect(first.groups[0].entries).toEqual(['译文'])
    expect(second).toEqual(first)
    expect(third).toEqual(first)
    expect(request).toHaveBeenCalledTimes(1)
  })

  test('parses Bing phonetics, definitions, audio and examples', () => {
    const result = parseBingHtml(`
      <div class="client_def_hd_hd">another</div>
      <div class="client_def_hd_pn_list">
        <span class="client_def_hd_pn">美国: [əˈnʌðər]</span>
        <a data-mp3link="/audio/another-us.mp3"></a>
      </div>
      <div class="client_def_container">
        <div class="client_def_bar">
          <span class="client_def_title_bar">adj.</span>
          <div class="client_def_list"><span class="client_def_list_item">另一个的</span></div>
        </div>
      </div>
      <div class="client_sentence_list">
        <div class="client_sen_en">Try another one.</div>
        <div class="client_sen_cn">再试一个。</div>
      </div>
    `)
    expect(result.headword).toBe('another')
    expect(result.phonetics[0].label).toContain('əˈnʌðər')
    expect(result.audio).toBe('https://cn.bing.com/audio/another-us.mp3')
    expect(result.groups[0]).toEqual({
      label: 'adj.',
      entries: ['另一个的']
    })
    expect(result.groups[1].entries[0]).toBe('Try another one. — 再试一个。')
  })

  test('keeps Bing common definitions concise before adding examples', () => {
    const bars = ['adj.', 'n.', 'v.', 'web', 'phrases']
      .map(
        (label, index) =>
          `<div class="client_def_bar"><span class="client_def_title_bar">${label}</span><span class="client_def_list_item">meaning ${index}</span></div>`
      )
      .join('')
    const result = parseBingHtml(
      `<div class="client_def_hd_hd">example</div><div class="client_def_container">${bars}</div>`
    )
    expect(result.groups.map(group => group.label)).toEqual([
      'adj.',
      'n.',
      'v.'
    ])
  })

  test('parses Youdao basic meanings and native speech URL', () => {
    const result = parseYoudaoHtml(`
      <h2 class="keyword">another</h2>
      <div class="baav"><span class="pronounce">美 [əˈnʌðər]
        <a class="dictvoice" data-rel="another&type=2"></a>
      </span></div>
      <div id="phrsListTab"><div class="trans-container">
        <ul><li>adj. 又一，另一</li><li>pron. 另一个</li></ul>
      </div></div>
    `)
    expect(result.headword).toBe('another')
    expect(result.groups[0].entries).toEqual([
      'adj. 又一，另一',
      'pron. 另一个'
    ])
    expect(result.audio).toContain('dict.youdao.com/dictvoice?audio=')
  })

  test('keeps complete source and translation text for machine translators', () => {
    const youdao = parseYoudaoTranslationHtml(
      '<div id="fanyiToggle"><div class="trans-container">这是一段完整译文。</div></div>',
      'This is a complete sentence.'
    )
    expect(youdao).toMatchObject({
      headword: 'This is a complete sentence.',
      isMachineTranslation: true,
      groups: [{ label: '翻译', entries: ['这是一段完整译文。'] }]
    })

    expect(
      parseCaiyunTranslation(
        { target: ['第一段。', '第二段。'] },
        'First. Second.'
      ).groups[0].entries[0]
    ).toBe('第一段。 第二段。')
    expect(
      parseBaiduTranslation(
        {
          status: 0,
          data: [{ src: 'First.', dst: '第一。' }, { src: 'Second.', dst: '第二。' }]
        },
        'First. Second.'
      ).groups[0].entries[0]
    ).toBe('第一。 第二。')
  })

  test('parses Cambridge bilingual senses', () => {
    const result = parseCambridgeHtml(`
      <div class="entry-body__el">
        <span class="headword">another</span>
        <span class="posgram">determiner</span>
        <span class="pron"><span class="ipa">əˈnʌð.ər</span></span>
        <span class="daud"><source type="audio/mpeg" src="/media/english/us_pron/a.mp3"></span>
        <div class="sense-body"><div class="def">one more person or thing</div><span class="trans">又一个</span></div>
      </div>
    `)
    expect(result.headword).toBe('another')
    expect(result.phonetics[0].label).toBe('/əˈnʌð.ər/')
    expect(result.audio).toBe(
      'https://dictionary.cambridge.org/media/english/us_pron/a.mp3'
    )
    expect(result.groups[0]).toEqual({
      label: 'determiner',
      entries: ['one more person or thing — 又一个']
    })
  })

  test('parses Oxford definitions, examples and regional speech', () => {
    const result = parseOxfordHtml(`
      <main id="entryContent"><div class="top-container"><div class="webtop">
        <span class="headword">example</span><span class="pos">noun</span>
        <div class="phonetics"><div><span class="phon">/ɪɡˈzɑːmpl/</span><button class="sound" data-src-mp3="/media/example.mp3"></button></div></div>
      </div></div><div class="entry"><ol><li class="sense"><span class="def">something typical</span><ul class="examples"><li class="x">This is an example.</li></ul></li></ol></div></main>
    `)
    expect(result.headword).toBe('example')
    expect(result.phonetics[0]).toEqual({
      label: '英 /ɪɡˈzɑːmpl/',
      audio: 'https://www.oxfordlearnersdictionaries.com/media/example.mp3'
    })
    expect(result.groups[0]).toEqual({
      label: 'noun',
      entries: ['something typical · 例：This is an example.']
    })
  })

  test('parses concise Collins definitions and examples', () => {
    const result = parseCollinsHtml(`
      <div class="entry dictionary cB"><span class="orth">example</span>
        <span class="pron">/ɪɡˈzɑːmpəl/</span><a class="audio_play_button" data-src-mp3="/audio/example.mp3"></a>
        <div class="sense"><div class="def">A thing that illustrates a rule.</div><div class="quote">For example, this sentence.</div></div>
      </div>
    `)
    expect(result.headword).toBe('example')
    expect(result.audio).toBe(
      'https://www.collinsdictionary.com/audio/example.mp3'
    )
    expect(result.groups).toEqual([
      { label: 'COBUILD', entries: ['A thing that illustrates a rule.'] },
      { label: '例句', entries: ['For example, this sentence.'] }
    ])
  })

  test('falls back to Collins sense text when definitions have no class', () => {
    const result = parseCollinsHtml(`
      <div class="entry dictionary cB"><span class="orth">example</span>
        <div class="sense">a representative form<div class="quote">an example sentence</div></div>
      </div>
    `)
    expect(result.groups[0]).toEqual({
      label: 'COBUILD',
      entries: ['a representative form']
    })
  })

  test('parses Free Dictionary parts of speech and examples', () => {
    const result = parseFreeDictionaryJson([
      {
        word: 'another',
        phonetic: '/əˈnʌðə/',
        phonetics: [{ audio: 'https://audio.example/another.mp3' }],
        meanings: [
          {
            partOfSpeech: 'determiner',
            definitions: [
              { definition: 'One more.', example: 'May I have another?' }
            ]
          }
        ]
      }
    ])
    expect(result.groups[0].entries[0]).toBe(
      'One more. · 例：May I have another?'
    )
    expect(result.audio).toBe('https://audio.example/another.mp3')
  })

  test('parses the public Etymonline summary', () => {
    const result = parseEtymonlineHtml(`
      <html><head><meta name="description" content="From Proto-Germanic roots; see origin and meaning."></head>
      <body><h1>weight</h1></body></html>
    `)
    expect(result.headword).toBe('weight')
    expect(result.groups[0]).toEqual({
      label: '词源摘要',
      entries: ['From Proto-Germanic roots; see origin and meaning.']
    })
  })

  test('rejects the generic Etymonline homepage description', () => {
    expect(() =>
      parseEtymonlineHtml(`
        <meta name="description" content="The online etymology dictionary is the internet's go-to source for quick and reliable accounts of the origin and history of English words.">
      `)
    ).toThrow('在线词源词典暂无结果')
  })

  test('uses dictionaries for one English word and multiple translators for a sentence', () => {
    const sources = [
      { id: 'google' },
      { id: 'caiyun', translationOnly: true },
      { id: 'youdaotrans', translationOnly: true },
      { id: 'baidu', translationOnly: true },
      { id: 'bing', englishOnly: true },
      { id: 'youdao', englishOnly: true }
    ]
    expect(applicableSources(sources, 'another').map(item => item.id)).toEqual([
      'google',
      'bing',
      'youdao'
    ])
    expect(
      applicableSources(sources, 'move to another directory').map(
        item => item.id
      )
    ).toEqual(['google', 'caiyun', 'youdaotrans', 'baidu'])
  })
})
