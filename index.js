const customize = require('customize')
const path = require('path')
const debug = require('debug')('bootpring:index')
const write = require('customize-write-files')
const pify = require('pify')
const fs = require('fs')
const readFile = pify(fs.readFile)
const yaml = require('js-yaml')

module.exports = class Bootprint {
  /**
   * Create a new Bootprint-instance
   *
   * @param {function(Customize):Customize} customizeModule a customize module (like `require('bootprint-openapi)`)
   * @param {object} config a customize-configuration to merge after loading the module
   */
  constructor (customizeModule, config) {
    this.customizeModule = customizeModule
    this.config = config
  }

  /**
   * Run the current engine with a
   * @param {object|string} input the input data (either the raw data as object, a filename as string or a url (string
   *  starting with http/https)
   * @param options
   */
  run (input, options) {
    return customize()
      .registerEngine('handlebars', require('customize-engine-handlebars'))
      .registerEngine('less', require('customize-engine-less'))
      .load(Bootprint.loadModule(this.customizeModule))
      .merge(this.config || {})
      .merge({
        handlebars: {
          data: Bootprint.loadInput(input)
            .catch(function (err) {
              // Augment error for identification in the cli script
              err.cause = 'bootprint-load-data'
              throw err
            })
        }
      })
      .run(options)
      .then(write(options.targetDir))
  }

  /**
   * Load the template module. Try loading "bootprint-`moduleName`" first. If it does not exist
   * treat "moduleName" as path to the module (relative to the current working dir).
   * @param moduleName {string} the name of the module to load
   * @return {function} the builder-function of the loaded module
   */
  static loadModule (moduleName) {
    if (typeof moduleName === 'function') {
      // This is probably already the module function
      return moduleName
    }
    var modulePath
    try {
      modulePath = require.resolve('bootprint-' + moduleName)
    } catch (e) {
      if (e.code !== 'MODULE_NOT_FOUND') {
        throw e
      }
      modulePath = path.resolve(moduleName)
    }
    debug('Loading module from ', modulePath)
    return require(moduleName)
  }

  /**
   * Helper method for loading the bootprint-data
   * @param fileOrUrlOrData
   * @returns {*}
   */
  static loadInput (fileOrUrlOrData) {
    // If this is not a string,
    // it is probably already the raw data.
    if (typeof fileOrUrlOrData !== 'string') {
      return Promise.resolve(fileOrUrlOrData)
    }

    // Load from url or file
    return Promise.resolve()
      .then(() => {
        if (fileOrUrlOrData.match(/^https?:\/\//)) {
          return loadUrl(fileOrUrlOrData)
        } else {
          return readFile(fileOrUrlOrData, 'utf-8')
        }
      })
      .then((data) => yaml.safeLoad(data, {json: true}))
      .catch(e => {
        if (e.code === 'ENOENT') {
          throw new CouldNotLoadInputError('Input could not be loaded:' + e.message)
        }
        throw e
      })
  }
}

/**
 * Loads data from a URL with proper user agent.
 * Returns a promise for the response content.
 * The promise is rejected of the response code indicates an error (400+)
 * @param {string} url the url to load data from
 * @access private
 */
function loadUrl (url) {
  const _package = require('./package')
  return require('popsicle')
    .get(url, {
      headers: {
        'User-Agent': `Bootprint/${_package.version}`
      }
    })
    .use(require('popsicle-status'))
    .then(response => response.body)
}

/**
 * Class for a custom error message without stack-strace
 */
class CouldNotLoadInputError extends Error {
  constructor (message) {
    super(message)
    this.stack = ''
  }
}

module.exports.CouldNotLoadInputError = CouldNotLoadInputError
