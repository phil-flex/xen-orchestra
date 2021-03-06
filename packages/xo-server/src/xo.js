import Config from '@xen-orchestra/mixins/Config'
import Hooks from '@xen-orchestra/mixins/Hooks'
import mixin from '@xen-orchestra/mixin'
import mixinLegacy from '@xen-orchestra/mixin/legacy'
import XoCollection from 'xo-collection'
import XoUniqueIndex from 'xo-collection/unique-index'
import { createClient as createRedisClient } from 'redis'
import { createDebounceResource } from '@vates/disposable/debounceResource'
import { createLogger } from '@xen-orchestra/log'
import { EventEmitter } from 'events'
import { noSuchObject } from 'xo-common/api-errors'
import { forEach, includes, isEmpty, iteratee, stubTrue } from 'lodash'
import { parseDuration } from '@vates/parse-duration'

import mixins from './xo-mixins'
import Connection from './connection'
import { generateToken, noop } from './utils'

// ===================================================================

const log = createLogger('xo:xo')

@mixinLegacy(Object.values(mixins))
export default class Xo extends EventEmitter {
  constructor(opts) {
    super()

    mixin(this, { Config, Hooks }, [opts])

    // a lot of mixins adds listener for start/stop/… events
    this.hooks.setMaxListeners(0)

    const { config } = opts

    this._objects = new XoCollection()
    this._objects.createIndex('byRef', new XoUniqueIndex('_xapiRef'))

    // Connections to users.
    this._nextConId = 0
    this._connections = { __proto__: null }

    this._httpRequestWatchers = { __proto__: null }

    // Connects to Redis.
    {
      const { renameCommands, socket: path, uri: url } = config.redis || {}

      this._redis = createRedisClient({
        path,
        rename_commands: renameCommands,
        url,
      })
    }

    this.hooks.on('start', () => this._watchObjects())

    const debounceResource = createDebounceResource()
    debounceResource.defaultDelay = parseDuration(config.resourceCacheDelay)
    this.hooks.on('stop', debounceResource.flushAll)

    this.debounceResource = debounceResource
  }

  // -----------------------------------------------------------------

  // Returns an object from its key or UUID.
  getObject(key, type) {
    const {
      all,
      indexes: { byRef },
    } = this._objects

    const obj = all[key] || byRef[key]
    if (!obj) {
      throw noSuchObject(key, type)
    }

    if (
      type != null &&
      ((typeof type === 'string' && type !== obj.type) || !includes(type, obj.type)) // Array
    ) {
      throw noSuchObject(key, type)
    }

    return obj
  }

  getObjects({ filter, limit } = {}) {
    const { all } = this._objects

    if (filter === undefined) {
      if (limit === undefined || limit === Infinity) {
        return all
      }
      filter = stubTrue
    } else {
      filter = iteratee(filter)
      if (limit === undefined) {
        limit = Infinity
      }
    }

    const results = { __proto__: null }
    for (const id in all) {
      const object = all[id]
      if (filter(object, id, all)) {
        if (limit-- <= 0) {
          break
        }
        results[id] = object
      }
    }
    return results
  }

  // -----------------------------------------------------------------

  createUserConnection() {
    const { _connections: connections } = this

    const connection = new Connection()
    const id = (connection.id = this._nextConId++)

    connections[id] = connection
    connection.on('close', () => {
      delete connections[id]
    })

    return connection
  }

  // -----------------------------------------------------------------

  _handleHttpRequest(req, res, next) { //NOTE: /xo/api/ may goes here.
    const { url } = req
    //xo:xo INFO _handleHttpRequest /xo//xo/ <-- here url has already has /xo/
    const { _httpRequestWatchers: watchers } = this
    //HACK: url in watches does not have /xo/ so remove it
    //const watchUrl = url.replace('/xo','')
    //const watchUrl = url //fix the url from generateToken
    //const watcher = watchers[watchUrl]
    //const watcher = watchers[url]
    //const watcher = watchers[encodeURI(url)];
    const token = url.replace('/xo','').replace('/api/','')
    const watcher = watchers[token] //url has already has /xo/
    //log.info(`DEBUG: _handleHttpRequest url : ${url}, token : ${token}`)
    //log.info(`DEBUG: _handleHttpRequest watcher : ${watcher}`)
    //debug('Debug watcher search-: url=%s, data=%s', encodeURI(url), watcher)

    if (!watcher) {
      next()
      return
    }
    if (!watcher.persistent) {
      //delete watchers[encodeURI(url)]
      //log.info(`DEBUG: _handleHttpRequest delete watcher ${url}, token ${token}`)
      delete watchers[token]
    }

    const { fn, data } = watcher
    new Promise(resolve => {
      resolve(fn.call(this, req, res, data, next))
    }).then(
      result => {
        if (result != null) {
          if (typeof result === 'string' || Buffer.isBuffer(result)) {
            res.end(result)
          } else if (typeof result.pipe === 'function') {
            result.pipe(res)
          } else {
            res.end(JSON.stringify(result))
          }
        }
      },
      error => {
        log.error('HTTP request error', { error })

        if (!res.headersSent) {
          res.writeHead(500)
          res.write('unknown error')
        }
        res.end()
      }
    )
  }

  async registerHttpRequest(fn, data, { suffix = '' } = {}) {
    const { _httpRequestWatchers: watchers } = this
    let url
    let token

    do {
      token = `${await generateToken()}${suffix}` //it is not required to add /xo/ in the url here
    } while (token in watchers)
        //debug('generateToken url: %s', url)
    //watchers[encodeURI(url)] = {
    //log.info(`registerHttpRequest token ${token}`)
    watchers[`${token}`] = {
      data,
      fn,
    }
    url = `/api/${token}` //Can't add /xo/ here ?
    //log.info(`registerHttpRequest url ${url}`)
    return url
  }

  async registerHttpRequestHandler(url, fn, { data = undefined, persistent = true } = {}) {
    const { _httpRequestWatchers: watchers } = this
    //debug('registerHttpRequestHandler url: %s', url)
    //log.info(`registerHttpRequestHandler urlsubstr : ${url.substr(4)}`) // /xo/
    let token
    token = url.replace('/xo','').replace('/api/','') // /xo/api/xxx --> xxx or /api/xxx --> xxx
    //if (url.substr(4) === '/xo/') { //it is not required to add /xo/ here
    //  url = `/xo${url}`
    //}
    //log.info(`registerHttpRequestHandler url ${url} token ${token}`)
    if (token in watchers) { //url has / already and it need to add /xo here since url don't have
      throw new Error(`a handler is already registered for ${url} token ${token}`)
    }

    //watchers[encodeURI(url)] = {
    watchers[token] = {
      data,
      fn,
      persistent,
    }
  }

  async unregisterHttpRequestHandler(url) {
    let token
    token = url.replace('/xo','').replace('/api/','') // /xo/api/xxx --> xxx or /api/xxx --> xxx
    //log.info(`unregisterHttpRequestHandlerttpRequest url: ${url}, token: ${token}`)
    delete this._httpRequestWatchers[`/xo${url}`] //it has not been tested
  }

  // -----------------------------------------------------------------

  // Plugins can use this method to expose methods directly on XO.
  defineProperty(name, value, thisArg = null) {
    if (name in this) {
      throw new Error(`Xo#${name} is already defined`)
    }

    // For security, prevent from accessing `this`.
    if (typeof value === 'function') {
      value = (value =>
        function () {
          return value.apply(thisArg, arguments)
        })(value)
    }

    Object.defineProperty(this, name, {
      configurable: true,
      value,
    })

    let unset = () => {
      delete this[name]
      unset = noop
    }
    return () => unset()
  }

  // Convenience method to define multiple properties at once.
  defineProperties(props, thisArg) {
    const unsets = []
    const unset = () => forEach(unsets, unset => unset())

    try {
      forEach(props, (value, name) => {
        unsets.push(this.defineProperty(name, value, thisArg))
      })
    } catch (error) {
      unset()
      throw error
    }

    return unset
  }

  // -----------------------------------------------------------------

  // Watches objects changes.
  //
  // Some should be forwarded to connected clients.
  // Some should be persistently saved.
  _watchObjects() {
    const { _connections: connections, _objects: objects } = this

    let entered, exited
    function reset() {
      entered = { __proto__: null }
      exited = { __proto__: null }
    }
    reset()

    function onAdd(items) {
      forEach(items, (item, id) => {
        entered[id] = item
      })
    }
    objects.on('add', onAdd)
    objects.on('update', onAdd)

    objects.on('remove', items => {
      forEach(items, (_, id) => {
        // We don't care about the value here, so we choose `0`
        // because it is small in JSON.
        exited[id] = 0
      })
    })

    objects.on('finish', () => {
      const enteredMessage = !isEmpty(entered) && {
        type: 'enter',
        items: entered,
      }
      const exitedMessage = !isEmpty(exited) && {
        type: 'exit',
        items: exited,
      }

      if (!enteredMessage && !exitedMessage) {
        return
      }

      forEach(connections, connection => {
        // Notifies only authenticated clients.
        if (connection.has('user_id') && connection.notify) {
          if (enteredMessage) {
            connection.notify('all', enteredMessage)
          }
          if (exitedMessage) {
            connection.notify('all', exitedMessage)
          }
        }
      })

      reset()
    })
  }
}
