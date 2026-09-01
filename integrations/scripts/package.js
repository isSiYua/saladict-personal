'use strict'

const fs = require('fs')
const path = require('path')
const archiver = require('archiver')
const webpack = require('webpack')

const repoRoot = path.resolve(__dirname, '..', '..')
const integrationsRoot = path.join(repoRoot, 'integrations')
const outputRoot = path.join(repoRoot, 'build', 'integrations')
const version = '0.6.0'

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function copyEntryWithLocalCore(source, destination) {
  const value = fs
    .readFileSync(source, 'utf8')
    .replace(
      "require('../shared/translation-core')",
      "require('./translation-core')"
    )
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.writeFileSync(destination, value)
}

function bundleObsidianEntry(source, destination) {
  return new Promise((resolve, reject) => {
    webpack(
      {
        mode: 'production',
        target: 'node',
        entry: source,
        externals: {
          obsidian: 'commonjs obsidian'
        },
        optimization: {
          minimize: false
        },
        output: {
          path: path.dirname(destination),
          filename: path.basename(destination),
          hashFunction: 'sha256',
          libraryTarget: 'commonjs2'
        }
      },
      (error, stats) => {
        if (error) return reject(error)
        if (stats.hasErrors()) {
          return reject(
            new Error(
              stats.toString({ all: false, errors: true, errorDetails: true })
            )
          )
        }
        resolve()
      }
    )
  })
}

function zipDirectory(directory, outputFile) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputFile)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(directory, path.basename(directory))
    archive.finalize()
  })
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true })
  fs.mkdirSync(outputRoot, { recursive: true })

  const vscodeOutput = path.join(
    outputRoot,
    'saladict-selection-translator-vscode'
  )
  copyEntryWithLocalCore(
    path.join(integrationsRoot, 'vscode', 'extension.js'),
    path.join(vscodeOutput, 'extension.js')
  )
  for (const file of [
    'package.json',
    'selection-controller.js',
    'hover-renderer.js',
    'README.md',
    '.vscodeignore'
  ]) {
    copyFile(
      path.join(integrationsRoot, 'vscode', file),
      path.join(vscodeOutput, file)
    )
  }
  copyFile(
    path.join(integrationsRoot, 'shared', 'translation-core.js'),
    path.join(vscodeOutput, 'translation-core.js')
  )
  copyFile(path.join(repoRoot, 'LICENSE'), path.join(vscodeOutput, 'LICENSE'))

  const obsidianOutput = path.join(outputRoot, 'saladict-selection-translator')
  await bundleObsidianEntry(
    path.join(integrationsRoot, 'obsidian', 'main.js'),
    path.join(obsidianOutput, 'main.js')
  )
  for (const file of ['manifest.json', 'styles.css', 'README.md']) {
    copyFile(
      path.join(integrationsRoot, 'obsidian', file),
      path.join(obsidianOutput, file)
    )
  }
  for (const dictionary of [
    'google',
    'youdao',
    'bing',
    'cambridge',
    'oaldict',
    'cobuild',
    'etymonline'
  ]) {
    copyFile(
      path.join(
        repoRoot,
        'src',
        'components',
        'dictionaries',
        dictionary,
        'favicon.png'
      ),
      path.join(obsidianOutput, 'assets', `${dictionary}.png`)
    )
  }
  copyFile(path.join(repoRoot, 'LICENSE'), path.join(obsidianOutput, 'LICENSE'))

  await Promise.all([
    zipDirectory(
      vscodeOutput,
      path.join(outputRoot, `saladict-vscode-${version}.zip`)
    ),
    zipDirectory(
      obsidianOutput,
      path.join(outputRoot, `saladict-obsidian-${version}.zip`)
    )
  ])

  process.stdout.write(
    [
      `VS Code folder: ${vscodeOutput}`,
      `Obsidian folder: ${obsidianOutput}`,
      `Artifacts: ${outputRoot}`
    ].join('\n') + '\n'
  )
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
